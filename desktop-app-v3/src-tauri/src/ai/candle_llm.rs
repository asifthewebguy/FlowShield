//! Concrete Phi-3-mini-4k-instruct Q4 GGUF runtime. Loads quantized weights
//! from `<app_data_dir>/models/phi-3-mini-4k-instruct/Phi-3-mini-4k-instruct-q4.gguf`,
//! exposes the `LlmRuntime` trait with `generate(prompt, max_tokens)`.
//!
//! Inference is CPU-bound. On commodity hardware (M1 Air baseline), expect
//! ~3–6 tokens/sec for Phi-3-mini Q4 — a 150-token briefing takes ~25–50s.
//! The async `generate` wraps the sync sampling loop in
//! `tokio::task::block_in_place` so a long generation doesn't starve the
//! runtime.
//!
//! Loaded once per process — Plan 1.5 owns the lifetime via `OnceLock`.
//! This file is a leaf; it does not know about Tauri.
//!
//! Runtime requirement: see CandleEmbedder — `block_in_place` requires a
//! multi-threaded tokio runtime (Tauri default is fine).

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use async_trait::async_trait;
use candle_core::quantized::gguf_file;
use candle_core::{Device, Tensor};
use candle_transformers::generation::LogitsProcessor;
use candle_transformers::models::quantized_phi3::ModelWeights;
use tokenizers::Tokenizer;

use crate::ai::registry::LLM_ID;
use crate::ai::runtime::LlmRuntime;
use crate::error::AiError;

/// Filenames inside the model directory. Match the layout the Plan 1.2
/// downloader writes to disk via `LLM_FILES` `local_filename` entries.
const GGUF_FILE: &str = "Phi-3-mini-4k-instruct-q4.gguf";
const TOKENIZER_FILE: &str = "tokenizer.json";

/// Sampling temperature. 0.0 = greedy; we use a low non-zero temp for slight
/// variation across days while staying mostly deterministic for the same
/// prompt + chunks.
const TEMPERATURE: f64 = 0.3;

/// Top-p (nucleus sampling). 0.9 trims long-tail unlikely tokens.
const TOP_P: f64 = 0.9;

/// Real Phi-3-mini runtime. The model is wrapped in `std::sync::Mutex`
/// because candle's `ModelWeights::forward` takes `&mut self` (KV cache
/// mutation), but the `LlmRuntime` trait gives us only `&self`. Lock
/// contention is zero in v1 (one briefing per day, sequential).
///
/// std::sync (not tokio): the lock guard never crosses an await — every use
/// is inside `generate_sync` running under `block_in_place`.
///
/// **Single-generation lifetime.** `quantized_phi3::ModelWeights` does not
/// expose a public KV-cache reset in candle 0.8.4. A second call to
/// `generate` would feed `index_pos = 0` while the cache still holds the
/// prior prompt's keys/values, corrupting output. We fail loudly on the
/// second call instead. Plan 1.5 owns the lifetime — it should drop and
/// reload the runtime per generation, or batch all prompts into one call.
pub struct CandleLlmRuntime {
    model: Mutex<ModelWeights>,
    tokenizer: Tokenizer,
    device: Device,
    /// Stop-token IDs. Phi-3 uses `<|end|>` for end-of-turn and
    /// `<|endoftext|>` for end-of-stream. Resolved at load time so we don't
    /// re-encode every `generate()` call.
    eos_token_ids: Vec<u32>,
    /// Tripwire for the single-generation constraint above. Set on first
    /// successful `generate_sync` entry; second call returns AiError.
    used: AtomicBool,
}

impl CandleLlmRuntime {
    /// Load Phi-3-mini Q4 from a directory containing the GGUF weights and
    /// `tokenizer.json` under `phi-3-mini-4k-instruct/`. Returns
    /// `AiError::ModelLoad` for any IO/parse/missing-file failure — never panics.
    pub fn load(model_dir: &Path) -> Result<Self, AiError> {
        let device = crate::ai::device::select_device();

        let gguf_path = model_dir.join(GGUF_FILE);
        let mut file = std::fs::File::open(&gguf_path)
            .map_err(|e| AiError::ModelLoad(format!("open {}: {e}", gguf_path.display())))?;
        let content = gguf_file::Content::read(&mut file)
            .map_err(|e| AiError::ModelLoad(format!("parse GGUF: {e}")))?;

        // candle 0.8.4 added a leading `use_flash_attn: bool` arg. We pass
        // false because the quantized (GGUF) path does not use flash-attn even
        // on a CUDA build — flash-attn is a dense-attention optimization and
        // is unrelated to quantization format. The compute device itself is
        // chosen by `select_device()` above and may be CPU or CUDA.
        let model = ModelWeights::from_gguf(false, content, &mut file, &device)
            .map_err(|e| AiError::ModelLoad(format!("ModelWeights::from_gguf: {e}")))?;

        let tok_path = model_dir.join(TOKENIZER_FILE);
        let tokenizer = Tokenizer::from_file(&tok_path).map_err(|e| {
            AiError::ModelLoad(format!("load tokenizer at {}: {e}", tok_path.display()))
        })?;

        // Resolve stop tokens. Phi-3 uses `<|end|>` (end-of-turn) and
        // `<|endoftext|>` (end-of-stream). Collect whichever the tokenizer
        // knows; error loudly if neither — that's a malformed tokenizer and
        // generation would never terminate cleanly.
        let eos_token_ids = ["<|end|>", "<|endoftext|>"]
            .iter()
            .filter_map(|t| tokenizer.token_to_id(t))
            .collect::<Vec<_>>();
        if eos_token_ids.is_empty() {
            return Err(AiError::ModelLoad(
                "tokenizer missing both <|end|> and <|endoftext|>".into(),
            ));
        }

        Ok(Self {
            model: Mutex::new(model),
            tokenizer,
            device,
            eos_token_ids,
            used: AtomicBool::new(false),
        })
    }

    /// Synchronous generation loop. Tokenize → forward → sample → append until
    /// `max_tokens` or a stop token. Feeds the full prompt on step 0, then
    /// only the last token thereafter — `quantized_phi3::ModelWeights`
    /// follows the `quantized_llama` pattern and maintains its own KV cache.
    /// If outputs are gibberish in Plan 1.4 Task 5's gated test, fall back to
    /// feeding full token history every step.
    fn generate_sync(&self, prompt: &str, max_tokens: usize) -> Result<String, AiError> {
        // Single-generation tripwire. See struct doc — KV cache cannot be
        // reset in candle 0.8.4. swap(true) returns the OLD value; if true,
        // someone already generated.
        if self.used.swap(true, Ordering::SeqCst) {
            return Err(AiError::Inference(
                "CandleLlmRuntime supports one generation per instance — \
                 reload the runtime before generating again"
                    .into(),
            ));
        }

        let encoding = self
            .tokenizer
            .encode(prompt, true)
            .map_err(|e| AiError::Tokenize(format!("encode prompt: {e}")))?;

        let mut tokens: Vec<u32> = encoding.get_ids().to_vec();
        let prompt_len = tokens.len();

        // Deterministic seed per-prompt: same prompt + chunks → same output.
        // Plan 1.5 re-renders today's briefing on settings page revisits;
        // drift would be user-visible.
        let seed = simple_hash_u64(prompt);
        let mut logits_processor = LogitsProcessor::new(seed, Some(TEMPERATURE), Some(TOP_P));

        let mut model = self
            .model
            .lock()
            .map_err(|_| AiError::Inference("model lock poisoned".into()))?;

        for step in 0..max_tokens {
            let context = if step == 0 {
                tokens.as_slice()
            } else {
                &tokens[tokens.len() - 1..]
            };
            let input = Tensor::new(context, &self.device)
                .and_then(|t| t.unsqueeze(0))
                .map_err(|e| AiError::Inference(format!("input tensor: {e}")))?;

            let index_pos = if step == 0 { 0 } else { prompt_len + step - 1 };
            let logits = model
                .forward(&input, index_pos)
                .map_err(|e| AiError::Inference(format!("forward: {e}")))?
                .squeeze(0)
                .map_err(|e| AiError::Inference(format!("squeeze: {e}")))?;

            let next_token = logits_processor
                .sample(&logits)
                .map_err(|e| AiError::Inference(format!("sample: {e}")))?;

            if self.eos_token_ids.contains(&next_token) {
                break;
            }

            tokens.push(next_token);
        }

        let generated = &tokens[prompt_len..];
        let text = self
            .tokenizer
            .decode(generated, true)
            .map_err(|e| AiError::Tokenize(format!("decode: {e}")))?;

        Ok(text)
    }
}

#[async_trait]
impl LlmRuntime for CandleLlmRuntime {
    async fn generate(&self, prompt: &str, max_tokens: usize) -> Result<String, AiError> {
        // Phi-3 Q4 generation is CPU-bound and slow (~3-6 tok/s). block_in_place
        // keeps the multi-threaded runtime from stalling other tasks (sync_worker,
        // tracker poll loop, etc) during the long synchronous loop. NOT
        // spawn_blocking — `&self` would need to be `'static`.
        tokio::task::block_in_place(|| self.generate_sync(prompt, max_tokens))
    }

    fn model_id(&self) -> &str {
        LLM_ID
    }
}

/// Stable u64 hash of a prompt string for `LogitsProcessor` seeding. FNV-1a
/// because `std::collections::hash_map::DefaultHasher` randomizes its seed
/// per-process — re-renders of today's briefing would drift across launches.
/// Plan 1.5 requires the same prompt to produce the same output on revisit.
fn simple_hash_u64(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::tempdir;

    #[test]
    fn model_id_matches_registry() {
        assert_eq!(LLM_ID, "phi-3-mini-4k-instruct-q4");
    }

    #[test]
    fn model_filenames_are_bare_not_subdir_prefixed() {
        // Callers pass the model subdir (e.g. `model_dir.join("phi-3-mini-4k-instruct")`),
        // and `load` joins these constants onto it. They must be bare filenames —
        // a subdir prefix here doubles the path (…/phi-3-mini-4k-instruct/phi-3-mini-4k-instruct/…).
        assert!(!GGUF_FILE.contains('/'), "GGUF_FILE must be a bare filename: {GGUF_FILE}");
        assert!(
            !TOKENIZER_FILE.contains('/'),
            "TOKENIZER_FILE must be a bare filename: {TOKENIZER_FILE}"
        );
    }

    #[test]
    fn load_missing_dir_returns_error() {
        let tmp = tempdir().expect("tempdir");
        let bogus = PathBuf::from(tmp.path()).join("does-not-exist");

        match CandleLlmRuntime::load(&bogus) {
            Err(AiError::ModelLoad(msg)) => {
                assert!(
                    msg.to_lowercase().contains("open")
                        || msg.to_lowercase().contains("gguf"),
                    "expected message to reference open/gguf, got: {msg}"
                );
            }
            Err(other) => panic!("expected ModelLoad, got {other:?}"),
            Ok(_) => panic!("expected error loading from empty dir"),
        }
    }

    #[test]
    fn load_corrupt_gguf_returns_error() {
        let tmp = tempdir().expect("tempdir");
        let dir = tmp.path();
        // GGUF_FILE is a nested path; create the parent dir first.
        let gguf_full = dir.join(GGUF_FILE);
        std::fs::create_dir_all(gguf_full.parent().unwrap()).expect("mkdir");
        std::fs::write(&gguf_full, b"not a real gguf").expect("write stub");

        match CandleLlmRuntime::load(dir) {
            Err(AiError::ModelLoad(_)) => {} // success
            Err(other) => panic!("expected ModelLoad, got {other:?}"),
            Ok(_) => panic!("expected error from invalid GGUF"),
        }
    }

    /// End-to-end generation on real Phi-3-mini weights. Skipped unless
    /// FLOWSHIELD_AI_TESTS=1 + FLOWSHIELD_AI_TEST_MODELS_DIR is set.
    #[test]
    fn real_generation() {
        if std::env::var("FLOWSHIELD_AI_TESTS").ok().as_deref() != Some("1") {
            eprintln!("skipped: FLOWSHIELD_AI_TESTS != 1");
            return;
        }
        let base = match std::env::var("FLOWSHIELD_AI_TEST_MODELS_DIR") {
            Ok(p) => PathBuf::from(p),
            Err(_) => {
                eprintln!("skipped: FLOWSHIELD_AI_TEST_MODELS_DIR unset");
                return;
            }
        };
        if !base.join(GGUF_FILE).exists() {
            eprintln!("skipped: {} missing", base.join(GGUF_FILE).display());
            return;
        }

        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("rt");

        let runtime = CandleLlmRuntime::load(&base).expect("load Phi-3-mini");

        let prompt = "Briefly say hello in one short sentence.";
        let out = rt
            .block_on(runtime.generate(prompt, 16))
            .expect("generate");

        eprintln!("Phi-3 generated: {out:?}");
        assert!(!out.is_empty(), "expected non-empty completion");
        assert!(
            out.len() <= 256,
            "expected ≤256 chars (16 tokens), got {} chars: {:?}",
            out.len(),
            out
        );
    }
}
