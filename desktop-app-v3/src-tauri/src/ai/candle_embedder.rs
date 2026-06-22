//! Concrete BGE-small-en-v1.5 embedder. Loads safetensors weights + the
//! HuggingFace tokenizer.json from `<app_data_dir>/models/bge-small-en-v1.5/`,
//! exposes the `Embedder` trait with mean-pooled L2-normalized 384-dim
//! outputs.
//!
//! Inference is CPU-bound and runs ~50 ms per chunk on commodity hardware.
//! The async `embed` method wraps the sync forward pass in
//! `tokio::task::block_in_place` so a long batch doesn't starve the runtime.
//!
//! Loaded once per process — Plan 1.5 owns the lifetime via a `OnceLock`
//! in `AppState`. This file is the leaf; it does not know about Tauri.

use std::path::Path;

use async_trait::async_trait;
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config, DTYPE};
use tokenizers::Tokenizer;

use crate::ai::embedder::{Embedder, EMBEDDING_DIM};
use crate::ai::registry::EMBEDDER_ID;
use crate::error::AiError;

/// Filenames inside the model directory. Match the layout the Plan 1.2
/// downloader writes to disk via `EMBEDDER_FILES` `local_filename` entries.
const SAFETENSORS_FILE: &str = "model.safetensors";
const TOKENIZER_FILE: &str = "tokenizer.json";
const CONFIG_FILE: &str = "config.json";

/// Maximum tokens we feed the model. BGE-small is trained at 512; longer
/// inputs are truncated. Corpus chunks (Plan 1.1) are short — single-line
/// session or reflection summaries — so truncation is rare.
const MAX_TOKENS: usize = 512;

/// Real BGE-small embedder. Owns the model + tokenizer for the process
/// lifetime. Cheap to call repeatedly; expensive (~50 ms per chunk) per call.
///
/// Runtime requirement: `embed` calls `tokio::task::block_in_place`, which
/// panics on a single-threaded tokio runtime. Tauri's default runtime is
/// multi-thread (confirmed via `rt-multi-thread` in Cargo.toml). If a future
/// caller invokes `embed` from a `#[tokio::test]` (current-thread by default),
/// build the runtime explicitly with `Builder::new_multi_thread()` first.
pub struct CandleEmbedder {
    model: BertModel,
    tokenizer: Tokenizer,
    device: Device,
}

impl CandleEmbedder {
    /// Return the cached embedder, loading it from `model_dir/bge-small-en-v1.5`
    /// on first use. The embedder is stateless and ~135 MB; both the briefing
    /// pipeline and the corpus indexer share this one instance.
    pub fn get_or_load(
        slot: &std::sync::OnceLock<std::sync::Arc<CandleEmbedder>>,
        model_dir: &std::path::Path,
    ) -> Result<std::sync::Arc<CandleEmbedder>, crate::error::AiError> {
        if let Some(e) = slot.get() {
            return Ok(e.clone());
        }
        let loaded = std::sync::Arc::new(CandleEmbedder::load(&model_dir.join("bge-small-en-v1.5"))?);
        let _ = slot.set(loaded.clone());
        Ok(slot.get().cloned().unwrap_or(loaded))
    }

    /// Load BGE-small from a directory containing `model.safetensors`,
    /// `tokenizer.json`, and `config.json`. Returns `AiError::ModelLoad` if
    /// any file is missing, the safetensors fails to parse, or the tensor
    /// names don't match what `BertModel` expects.
    pub fn load(model_dir: &Path) -> Result<Self, AiError> {
        let device = Device::Cpu;

        let config_path = model_dir.join(CONFIG_FILE);
        let config_bytes = std::fs::read(&config_path)
            .map_err(|e| AiError::ModelLoad(format!("read {}: {e}", config_path.display())))?;
        let config: Config = serde_json::from_slice(&config_bytes)
            .map_err(|e| AiError::ModelLoad(format!("parse config.json: {e}")))?;

        let tokenizer_path = model_dir.join(TOKENIZER_FILE);
        let tokenizer = Tokenizer::from_file(&tokenizer_path).map_err(|e| {
            AiError::ModelLoad(format!("load tokenizer at {}: {e}", tokenizer_path.display()))
        })?;

        let weights_path = model_dir.join(SAFETENSORS_FILE);
        // SAFETY: candle's `from_mmaped_safetensors` is sound provided the
        // file isn't mutated under us. We only read; the downloader writes
        // atomically with rename. The mmap lives as long as `vb`.
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[weights_path.clone()], DTYPE, &device).map_err(
                |e| AiError::ModelLoad(format!("mmap {}: {e}", weights_path.display())),
            )?
        };

        let model = BertModel::load(vb, &config)
            .map_err(|e| AiError::ModelLoad(format!("BertModel::load: {e}")))?;

        Ok(Self {
            model,
            tokenizer,
            device,
        })
    }

    /// Synchronous forward pass. Tokenize → forward → mean-pool → L2 normalize.
    ///
    /// Why mean pooling: BGE-small's recommended sentence embedding is the
    /// mean of token hidden states (NOT [CLS]) — see model card on HF.
    /// Mismatch here silently degrades retrieval quality in Plan 1.5.
    fn embed_sync(&self, text: &str) -> Result<Vec<f32>, AiError> {
        let mut encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| AiError::Tokenize(format!("encode: {e}")))?;

        // Truncate to MAX_TOKENS — BGE-small's max position embeddings are
        // 512. Forward will panic on longer sequences. stride=0 means no
        // overlap window; we embed each chunk independently (no sliding).
        encoding.truncate(MAX_TOKENS, 0, tokenizers::TruncationDirection::Right);

        let ids: Vec<u32> = encoding.get_ids().to_vec();
        let attention: Vec<u32> = encoding.get_attention_mask().to_vec();
        let token_type_ids: Vec<u32> = encoding.get_type_ids().to_vec();

        let seq_len = ids.len();

        let input_ids = Tensor::new(ids.as_slice(), &self.device)
            .and_then(|t| t.unsqueeze(0))
            .map_err(|e| AiError::Inference(format!("input_ids tensor: {e}")))?;
        let attention_mask = Tensor::new(attention.as_slice(), &self.device)
            .and_then(|t| t.unsqueeze(0))
            .map_err(|e| AiError::Inference(format!("attention tensor: {e}")))?;
        let token_type_ids_tensor = Tensor::new(token_type_ids.as_slice(), &self.device)
            .and_then(|t| t.unsqueeze(0))
            .map_err(|e| AiError::Inference(format!("token_type tensor: {e}")))?;

        // BertModel::forward signature in candle-transformers 0.8 is
        // `forward(&self, input_ids, token_type_ids, attention_mask: Option<&Tensor>)`.
        // If a future bump changes this, fix here — the build error is loud.
        let hidden = self
            .model
            .forward(&input_ids, &token_type_ids_tensor, Some(&attention_mask))
            .map_err(|e| AiError::Inference(format!("BertModel::forward: {e}")))?;

        // Mean-pool with attention mask: sum(hidden * mask) / sum(mask).
        // Cast mask to f32 and broadcast over the hidden dim.
        let mask = attention_mask
            .to_dtype(DType::F32)
            .and_then(|t| t.unsqueeze(2))
            .map_err(|e| AiError::Inference(format!("mask cast: {e}")))?;

        let masked = hidden
            .broadcast_mul(&mask)
            .map_err(|e| AiError::Inference(format!("masked sum: {e}")))?;

        let sum = masked
            .sum(1)
            .map_err(|e| AiError::Inference(format!("sum: {e}")))?;

        let count = mask
            .sum(1)
            .map_err(|e| AiError::Inference(format!("count: {e}")))?;

        let mean = sum
            .broadcast_div(&count)
            .map_err(|e| AiError::Inference(format!("mean div: {e}")))?;

        // L2 normalize: x / ||x||_2.
        let norm = mean
            .sqr()
            .and_then(|t| t.sum_keepdim(1))
            .and_then(|t| t.sqrt())
            .map_err(|e| AiError::Inference(format!("l2 norm compute: {e}")))?;
        let normed = mean
            .broadcast_div(&norm)
            .map_err(|e| AiError::Inference(format!("l2 norm div: {e}")))?;

        // Squeeze the batch dim (we processed batch=1).
        let flat: Vec<f32> = normed
            .squeeze(0)
            .and_then(|t| t.to_vec1::<f32>())
            .map_err(|e| AiError::Inference(format!("to_vec1: {e}")))?;

        if flat.len() != EMBEDDING_DIM {
            return Err(AiError::Inference(format!(
                "embedding dim {} != EMBEDDING_DIM {} (seq_len={seq_len})",
                flat.len(),
                EMBEDDING_DIM
            )));
        }

        Ok(flat)
    }
}

#[async_trait]
impl Embedder for CandleEmbedder {
    async fn embed(&self, text: &str) -> Result<Vec<f32>, AiError> {
        // BertModel forward is CPU-bound and ~50 ms; block_in_place keeps
        // the multi-threaded runtime from stalling other tasks (sync_worker,
        // tracker poll loop, etc).
        tokio::task::block_in_place(|| self.embed_sync(text))
    }

    fn embedder_id(&self) -> &str {
        EMBEDDER_ID
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::tempdir;

    /// embedder_id must match registry constant — Plan 1.5 keys cache lookups
    /// off this string and a drift would silently invalidate every chunk's
    /// embedding when re-loaded.
    #[test]
    fn embedder_id_matches_registry() {
        // We can't construct CandleEmbedder without weights, but the
        // associated constant is reachable.
        assert_eq!(EMBEDDER_ID, "bge-small-en-v1.5");
    }

    /// `load` must surface a typed `AiError::ModelLoad` (not panic) when the
    /// model directory is missing files. Plan 1.5's settings page renders
    /// this verbatim — a panic here would crash the renderer.
    #[test]
    fn load_missing_dir_returns_error() {
        let tmp = tempdir().expect("tempdir");
        let bogus = PathBuf::from(tmp.path()).join("does-not-exist");

        match CandleEmbedder::load(&bogus) {
            Err(AiError::ModelLoad(msg)) => {
                assert!(
                    msg.to_lowercase().contains("config")
                        || msg.to_lowercase().contains("read"),
                    "expected message to reference config/read, got: {msg}"
                );
            }
            Err(other) => panic!("expected ModelLoad, got {other:?}"),
            Ok(_) => panic!("expected error loading from empty dir"),
        }
    }

    /// `load` must error cleanly when only some of the three files exist
    /// (partial download case from Plan 1.2 mid-run-cancel).
    #[test]
    fn load_partial_dir_returns_error() {
        let tmp = tempdir().expect("tempdir");
        let dir = tmp.path();
        std::fs::write(dir.join(CONFIG_FILE), "not valid json").expect("write config");
        // tokenizer.json + safetensors intentionally missing.

        match CandleEmbedder::load(dir) {
            Err(AiError::ModelLoad(_)) => {} // success
            Err(other) => panic!("expected ModelLoad, got {other:?}"),
            Ok(_) => panic!("expected error from invalid config"),
        }
    }

    /// End-to-end forward pass on real BGE-small weights. Skipped unless
    /// `FLOWSHIELD_AI_TESTS=1` and `FLOWSHIELD_AI_TEST_MODELS_DIR` points at
    /// a directory containing `bge-small-en-v1.5/{model.safetensors,
    /// tokenizer.json, config.json}` — typically `~/flowshield-test-models`
    /// after running:
    ///
    ///   mkdir -p ~/flowshield-test-models/bge-small-en-v1.5
    ///   cd ~/flowshield-test-models/bge-small-en-v1.5
    ///   curl -L -O https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/model.safetensors
    ///   curl -L -O https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/tokenizer.json
    ///   curl -L -O https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/config.json
    ///
    ///   FLOWSHIELD_AI_TESTS=1 \
    ///     FLOWSHIELD_AI_TEST_MODELS_DIR=~/flowshield-test-models \
    ///     cargo test --lib ai::candle_embedder::tests::real_forward_pass -- --nocapture
    #[test]
    fn real_forward_pass() {
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
        let model_dir = base.join("bge-small-en-v1.5");
        if !model_dir.exists() {
            eprintln!("skipped: {} missing", model_dir.display());
            return;
        }

        // Tokio runtime so we can call the async `Embedder::embed`.
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("rt");

        let embedder = CandleEmbedder::load(&model_dir).expect("load BGE-small");

        // Two semantically related sentences should have higher cosine
        // similarity than two unrelated ones.
        let a = rt.block_on(embedder.embed("I am working on a coding project."))
            .expect("embed a");
        let b = rt.block_on(embedder.embed("Writing software for my job."))
            .expect("embed b");
        let c = rt.block_on(embedder.embed("Pineapple pizza is divisive."))
            .expect("embed c");

        assert_eq!(a.len(), EMBEDDING_DIM);
        assert_eq!(b.len(), EMBEDDING_DIM);
        assert_eq!(c.len(), EMBEDDING_DIM);

        // L2-normalized vectors: cosine == dot.
        let dot = |x: &[f32], y: &[f32]| x.iter().zip(y).map(|(a, b)| a * b).sum::<f32>();
        let sim_ab = dot(&a, &b);
        let sim_ac = dot(&a, &c);

        assert!(
            sim_ab > sim_ac,
            "expected related pair to score higher: sim_ab={sim_ab} sim_ac={sim_ac}"
        );

        // Unit-norm sanity (allow small numerical slack).
        let mag = |x: &[f32]| x.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((mag(&a) - 1.0).abs() < 1e-3, "||a||={}", mag(&a));
    }
}
