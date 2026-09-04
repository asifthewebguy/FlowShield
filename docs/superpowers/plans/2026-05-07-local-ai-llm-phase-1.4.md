# FlowShield Local AI — Concrete Phi-3-mini LLM Runtime (Phase 1.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Model swap from prior draft:** This plan was originally drafted to use Gemma-2-2B-it Q4_K_M, but candle 0.8 ships only fp32 `gemma2.rs` (no `quantized_gemma2`). Probing confirmed candle 0.8 ships `quantized_phi3.rs`. Approved swap (2026-05-07): use **Phi-3-mini-4k-instruct Q4 GGUF** instead — MIT license, unauthenticated download from Microsoft's official HF repo, similar quality for summarization. Disk + RAM budgets hold (within slack).

**Goal:** Land a real `CandleLlmRuntime` that loads Phi-3-mini-4k-instruct Q4 GGUF from disk and produces text completions via `candle-transformers`. Implements the existing `LlmRuntime` async trait so Plan 1.5 (briefing pipeline) can swap from the temporary `MockLlmRuntime` to real on-device generation. Also swaps `ai/registry.rs::LLM_ID` and `LLM_FILES` from the Gemma 2 placeholder entries to Phi-3-mini's URL/sha256/size, and adds the tokenizer file.

**Architecture:** Pure-Rust quantized Phi-3 inference. `candle-core::quantized::gguf_file::Content::read` parses the Q4 GGUF on disk; `candle-transformers::models::quantized_phi3::ModelWeights::from_gguf` builds the forward pass. Generation is a tokenize → forward → sample → append loop running until `max_tokens` or a `<|end|>` / `<|endoftext|>` stop token. Like the embedder, inference is CPU-bound; the async `generate` wraps the sync loop in `tokio::task::block_in_place`.

**Trait already exists** at `desktop-app-v3/src-tauri/src/ai/runtime.rs`:

```rust
async fn generate(&self, prompt: &str, max_tokens: usize) -> Result<String, AiError>;
fn model_id(&self) -> &str;
```

Returns the full string (no streaming callback). Plan 1.5 may add streaming if briefing UX demands progressive rendering — out of scope for 1.4.

**Tech Stack:** Rust 2021, `candle-core = "0.8"` (already), `candle-nn = "0.8"` (already), `candle-transformers = "0.8"` (already), `tokenizers = "0.20"` (already), `tokio` (existing), `async-trait` (existing). No new deps. CPU only — no `cuda` / `metal` / `mkl` / `accelerate` features.

**Reference parent spec:** [/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md](/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md) — design doc approved 2026-05-05 (parent named Gemma-2-2B as v1 LLM; Phi-3-mini supersedes due to candle 0.8 quantized support).

**Predecessor plans:**
- [docs/superpowers/plans/2026-05-05-local-ai-substrate-phase-1.1.md](2026-05-05-local-ai-substrate-phase-1.1.md) (PR #70) — `LlmRuntime` trait + `MockLlmRuntime`.
- [docs/superpowers/plans/2026-05-06-local-ai-model-download-phase-1.2.md](2026-05-06-local-ai-model-download-phase-1.2.md) (PR #72) — registry, sha256-verified downloader.
- [docs/superpowers/plans/2026-05-07-local-ai-embedder-phase-1.3.md](2026-05-07-local-ai-embedder-phase-1.3.md) (PR #74) — `CandleEmbedder` for BGE-small. Set the pattern this plan follows.

---

## File structure

**New files:**
- `desktop-app-v3/src-tauri/src/ai/candle_llm.rs` — `CandleLlmRuntime` struct, `load(model_dir)` constructor, sync generation loop with sampling + stop tokens, `LlmRuntime` async impl.

**Modified files:**
- `desktop-app-v3/src-tauri/src/ai/registry.rs` — change `LLM_ID` from `"gemma-2-2b-it-q4_k_m"` to `"phi-3-mini-4k-instruct-q4"`; replace the Gemma `LLM_FILES` entry with two Phi-3 entries (GGUF + tokenizer); fill real sha256 hashes.
- `desktop-app-v3/src-tauri/src/ai/mod.rs` — `pub mod candle_llm;`.
- `desktop-app-v3/src-tauri/Cargo.toml` — no changes expected (candle 0.8 ships `quantized_phi3` without a feature flag).

**Out of scope** (defer to later sub-plans):
- Briefing pipeline + BriefingCard UI → **Plan 1.5**
- Streaming token callback → deferred unless Plan 1.5 demands it
- Wiring into Tauri-managed singleton → Plan 1.5 owns the lifetime
- GPU / Metal acceleration → Plan 2.x optimization (CPU only in v1)
- Reflection-question generation (uses the same runtime; Plan 1.6 wires the prompt)
- Conversational mode / multi-turn → not in v1 product scope

---

## Tasks

### Task 1: Branch (probe already complete)

**Files:** None.

The candle 0.8 module probe was completed during plan revision — `~/.cargo/registry/src/index.crates.io-*/candle-transformers-0.8.*/src/models/quantized_phi3.rs` exists. No Cargo.toml feature flag needed.

- [ ] **Step 1: Branch from main**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git checkout main
git pull --ff-only
git checkout -b feat/local-ai-llm
```

No commit at this step.

---

### Task 2: Swap registry from Gemma 2 to Phi-3-mini + fill real sha256s

**Files:** Modify `desktop-app-v3/src-tauri/src/ai/registry.rs`.

The registry currently has placeholder Gemma 2 entries. Swap to Phi-3-mini and fill real upstream sha256 hashes from Microsoft's official HF mirror (MIT-licensed, unauthenticated).

- [ ] **Step 1: Download Phi-3 files locally**

```bash
mkdir -p /tmp/phi3-real-hashes
cd /tmp/phi3-real-hashes
curl -L -o Phi-3-mini-4k-instruct-q4.gguf \
  https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf
curl -L -o tokenizer.json \
  https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/tokenizer.json
```

Expected:
- `Phi-3-mini-4k-instruct-q4.gguf` ≈ 2.4 GB
- `tokenizer.json` ≈ 2 MB

If `tokenizer.json` is **404 in microsoft/Phi-3-mini-4k-instruct-gguf**, fall back to the safetensors-bearing repo: `https://huggingface.co/microsoft/Phi-3-mini-4k-instruct/resolve/main/tokenizer.json` (also unauthenticated, MIT).

- [ ] **Step 2: Compute lowercase-hex sha256 + verify sizes**

```bash
sha256sum /tmp/phi3-real-hashes/*
ls -l /tmp/phi3-real-hashes/
```

Capture both 64-char lowercase hex strings.

- [ ] **Step 3: Edit `registry.rs`**

Read the file first to preserve formatting.

Change `LLM_ID`:

```rust
/// Identifier baked into `ai_briefings.model_id` for cache invalidation.
pub const LLM_ID: &str = "phi-3-mini-4k-instruct-q4";
```

Replace the entire `LLM_FILES` array body with the two Phi-3 entries:

```rust
/// Files that make up the LLM bundle. Phi-3-mini-4k-instruct ships as a
/// quantized GGUF + a tokenizer.json (the GGUF doesn't carry tokenizer
/// vocab in a form candle-transformers' quantized_phi3 reads).
pub const LLM_FILES: &[ModelFile] = &[
    ModelFile {
        url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
        local_filename: "phi-3-mini-4k-instruct/Phi-3-mini-4k-instruct-q4.gguf",
        sha256: "<real hex from Step 2>",  // real upstream sha256 — verified 2026-05-07
        size_bytes: 2_400_000_000,  // adjust to actual size
    },
    ModelFile {
        url: "<chosen tokenizer URL from Step 1 fallback note>",
        local_filename: "phi-3-mini-4k-instruct/tokenizer.json",
        sha256: "<real hex from Step 2>",  // real upstream sha256 — verified 2026-05-07
        size_bytes: 2_000_000,  // adjust to actual size
    },
];
```

Update the module-level doc comment (lines 1–13 of `registry.rs`): remove the "PLACEHOLDERS for Plan 1.4 (LLM) only" sentence — all hashes are now filled.

- [ ] **Step 4: Verify build + run substrate tests**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -5
cargo test --lib ai::registry 2>&1 | tail -10
```

Expected: clean build, registry tests pass. If a registry test asserts the OLD Gemma URL or `LLM_FILES.len() == 1`, update it to expect Phi-3 (URL substring `Phi-3`) and `len() == 2`.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/registry.rs
git commit -m "feat(desktop-v3): swap LLM to Phi-3-mini + fill real sha256 hashes"
```

---

### Task 3: Create `candle_llm.rs` scaffold + `LlmRuntime` impl

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/candle_llm.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs` (add `pub mod candle_llm;`).

This is the biggest task. Shape mirrors `candle_embedder.rs` from Plan 1.3:

```rust
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
use std::sync::Mutex;

use async_trait::async_trait;
use candle_core::{Device, Tensor};
use candle_core::quantized::gguf_file;
use candle_transformers::generation::LogitsProcessor;
use candle_transformers::models::quantized_phi3::ModelWeights;
use tokenizers::Tokenizer;

use crate::ai::registry::LLM_ID;
use crate::ai::runtime::LlmRuntime;
use crate::error::AiError;

/// Filenames inside the model directory.
const GGUF_FILE: &str = "phi-3-mini-4k-instruct/Phi-3-mini-4k-instruct-q4.gguf";
const TOKENIZER_FILE: &str = "phi-3-mini-4k-instruct/tokenizer.json";

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
pub struct CandleLlmRuntime {
    model: Mutex<ModelWeights>,
    tokenizer: Tokenizer,
    device: Device,
    /// Stop-token IDs. Phi-3 uses `<|end|>` for end-of-turn and
    /// `<|endoftext|>` for end-of-stream. Read at load time so we don't
    /// re-encode every generate().
    eos_token_ids: Vec<u32>,
}

impl CandleLlmRuntime {
    pub fn load(model_dir: &Path) -> Result<Self, AiError> {
        let device = Device::Cpu;

        let gguf_path = model_dir.join(GGUF_FILE);
        let mut file = std::fs::File::open(&gguf_path)
            .map_err(|e| AiError::ModelLoad(format!("open {}: {e}", gguf_path.display())))?;
        let content = gguf_file::Content::read(&mut file)
            .map_err(|e| AiError::ModelLoad(format!("parse GGUF: {e}")))?;

        let model = ModelWeights::from_gguf(content, &mut file, &device)
            .map_err(|e| AiError::ModelLoad(format!("ModelWeights::from_gguf: {e}")))?;

        let tok_path = model_dir.join(TOKENIZER_FILE);
        let tokenizer = Tokenizer::from_file(&tok_path)
            .map_err(|e| AiError::ModelLoad(format!("load tokenizer at {}: {e}", tok_path.display())))?;

        // Resolve stop tokens. Phi-3 uses `<|end|>` and `<|endoftext|>`.
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
        })
    }

    fn generate_sync(&self, prompt: &str, max_tokens: usize) -> Result<String, AiError> {
        let encoding = self
            .tokenizer
            .encode(prompt, true)
            .map_err(|e| AiError::Tokenize(format!("encode prompt: {e}")))?;

        let mut tokens: Vec<u32> = encoding.get_ids().to_vec();
        let prompt_len = tokens.len();

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
        tokio::task::block_in_place(|| self.generate_sync(prompt, max_tokens))
    }

    fn model_id(&self) -> &str {
        LLM_ID
    }
}

fn simple_hash_u64(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    h.finish()
}
```

> **Implementer notes:**
>
> 1. The skeleton uses **`std::sync::Mutex`** (not tokio's) — the lock guard never crosses an await; everything inside `generate_sync` is synchronous within `block_in_place`.
> 2. The `forward(&Tensor, index_pos: usize)` signature is the candle 0.7/0.8 pattern. If candle 0.8 has changed it, adapt — it's a compile error, not a silent bug. Read the source at `~/.cargo/registry/src/index.crates.io-*/candle-transformers-0.8.*/src/models/quantized_phi3.rs`.
> 3. The "feed only last token after step 0" optimization assumes `ModelWeights` maintains a KV cache internally. candle's `quantized_phi3` follows the `quantized_llama` pattern which definitely maintains KV cache. Verify with the gated test in Task 5; if outputs are gibberish, fall back to feeding full token history every step.
> 4. `LogitsProcessor::new(seed, Some(temp), Some(top_p))` is the candle 0.7 API. 0.8 may have changed this — check if `LogitsProcessor::from_sampling(seed, Sampling::TopP { p, temperature })` is the new shape.

- [ ] **Step 1: Read `candle_embedder.rs` for style reference**

```bash
cat /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri/src/ai/candle_embedder.rs
```

Match the comment style, error-mapping density, and SAFETY annotations.

- [ ] **Step 2: Create `candle_llm.rs`**

Use the skeleton above. Items the implementer must finalize at compile-time:
- The `ModelWeights::forward` signature in candle 0.8 — adapt the call shape if different.
- The `LogitsProcessor` API — same.

- [ ] **Step 3: Declare module in `ai/mod.rs`**

Add `pub mod candle_llm;` alphabetically (between `candle_embedder` and `corpus`).

- [ ] **Step 4: Verify build**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -30
```

Expected outcomes (priority order):

1. **Clean build.** Move on.
2. **`forward` signature mismatch.** Read the candle 0.8 source for the actual signature and fix the call.
3. **`LogitsProcessor` API change.** Same as above — read source.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/candle_llm.rs \
        desktop-app-v3/src-tauri/src/ai/mod.rs
git commit -m "feat(desktop-v3): CandleLlmRuntime for Phi-3-mini Q4 GGUF"
```

---

### Task 4: Unit tests (mock-only, no real model)

**Files:** Append `#[cfg(test)] mod tests` to `candle_llm.rs`.

Same pattern as Plan 1.3 Task 4 — verify `model_id` matches the registry constant and that `load()` errors cleanly when files are missing.

- [ ] **Step 1: Append tests block**

```rust
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
}
```

- [ ] **Step 2: Run unit tests**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::candle_llm 2>&1 | tail -20
```

Expected: 3 passing tests.

- [ ] **Step 3: Run full substrate test suite (no regressions)**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib 2>&1 | tail -10
```

Expected: 78 (Plan 1.3 baseline) + 3 = 81 tests passing.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/candle_llm.rs
git commit -m "test(desktop-v3): unit tests for CandleLlmRuntime load failure paths"
```

---

### Task 5: Gated integration test (real Phi-3 weights)

**Files:** Append to `candle_llm.rs` tests block.

- [ ] **Step 1: Append gated test**

```rust
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
```

- [ ] **Step 2: Run with real model on dev box**

```bash
mkdir -p ~/flowshield-test-models/phi-3-mini-4k-instruct
mv /tmp/phi3-real-hashes/Phi-3-mini-4k-instruct-q4.gguf ~/flowshield-test-models/phi-3-mini-4k-instruct/
mv /tmp/phi3-real-hashes/tokenizer.json ~/flowshield-test-models/phi-3-mini-4k-instruct/

cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
FLOWSHIELD_AI_TESTS=1 \
  FLOWSHIELD_AI_TEST_MODELS_DIR=$HOME/flowshield-test-models \
  cargo test --lib ai::candle_llm::tests::real_generation -- --nocapture 2>&1 | tail -30
```

Expected: 1 passing test. **Latency: 30–90s end to end** (cold load + 16 tokens generation).

- [ ] **Step 3: Verify the gate keeps default test runs silent**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::candle_llm 2>&1 | tail -10
```

Expected: 4 tests run; `real_generation` skips early.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/candle_llm.rs
git commit -m "test(desktop-v3): gated end-to-end CandleLlmRuntime generation"
```

---

### Task 6: Open the PR

- [ ] **Step 1: Push branch**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git push -u origin feat/local-ai-llm
```

- [ ] **Step 2: Open PR via `gh`**

```bash
gh pr create --title "feat(desktop-v3): concrete Phi-3-mini LLM runtime via candle (Phase 1.4)" \
  --body "$(cat <<'EOF'
## Summary

Phase 1.4 of the Local AI rollout. Lands a real \`CandleLlmRuntime\` that loads Phi-3-mini-4k-instruct Q4 GGUF and produces completions via \`candle-transformers\`.

**Model swap:** Originally planned with Gemma-2-2B-it Q4_K_M, but candle 0.8 ships only fp32 \`gemma2.rs\` (no \`quantized_gemma2\`). Switched to Phi-3-mini-4k-instruct (MIT, candle 0.8 ships \`quantized_phi3.rs\`).

**Predecessor plans:** PR #70 (substrate), PR #72 (downloader), PR #74 (embedder).
**Plan doc:** \`docs/superpowers/plans/2026-05-07-local-ai-llm-phase-1.4.md\`.

## What's in

- \`desktop-app-v3/src-tauri/src/ai/candle_llm.rs\` — \`CandleLlmRuntime\` struct, \`load(model_dir)\`, sync generation loop with greedy / temp+top-p sampling, Phi-3 stop tokens (\`<|end|>\` / \`<|endoftext|>\`), async \`LlmRuntime\` impl wrapping the sync path in \`block_in_place\`.
- 4 new unit/integration tests (3 unconditional, 1 gated by \`FLOWSHIELD_AI_TESTS=1\`).
- Real sha256 hashes for \`Phi-3-mini-4k-instruct-q4.gguf\` and \`tokenizer.json\` in \`registry.rs\`; \`LLM_ID\` updated.

## Performance note

CPU-only Phi-3-mini Q4 generation runs at ~3–6 tokens/sec on commodity hardware. A 150-token briefing therefore takes ~25–50s. Plan 1.5 will need to render a "generating…" state if this exceeds the parent design's <10s briefing budget — flag for product review.

## Test plan

- [ ] \`cargo check\` clean
- [ ] \`cargo test --lib\` — 81 tests pass (78 baseline + 3 new unconditional)
- [ ] \`cargo test --lib ai::candle_llm\` — 4 tests, gated test skips when env-flag absent
- [ ] With \`FLOWSHIELD_AI_TESTS=1\` + real Phi-3 weights on disk: \`real_generation\` produces non-empty completion within bounds.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Capture PR URL**

`gh pr create` returns the PR URL — paste it back so the human reviewer can find it.

---

## Risk callouts

| Risk | Mitigation |
|---|---|
| `LogitsProcessor` / `ModelWeights::forward` API drift across candle minor versions | Pinned to 0.8; Task 3 Step 4 outcome (2)+(3) document where to fix. |
| `LlmRuntime` trait's `&self` vs candle `forward(&mut self)` mismatch | Skeleton wraps `model` in `std::sync::Mutex`. Lock contention is zero. Lock guard never crosses an await — std Mutex is correct. |
| Performance budget (parent design says <10s briefing; CPU Q4 Phi-3-mini is ~25–50s for 150 tokens) | **Surfaced in PR description for product review.** Mitigations: (a) reduce briefing length to 50 tokens, (b) "generating…" UI state in Plan 1.5, (c) GPU acceleration in v2. |
| KV cache management — feeding only last token after step 0 assumes `ModelWeights` maintains its own KV cache | candle's `quantized_phi3` follows the `quantized_llama` pattern (KV cache maintained). Task 5's gated test catches if broken. |
| Stop-token coverage — Phi-3 uses `<|end|>` for end-of-turn AND `<|endoftext|>` for end-of-stream | Task 3 reads BOTH from the tokenizer at load time and stops on either. Errors loudly if neither token exists. |
| Sampling determinism — re-rendering today's briefing produces different text each time → user confusion | `simple_hash_u64(prompt)` seeds `LogitsProcessor` deterministically per-prompt. Same prompt → same output. |
| Disk space — 2.4 GB GGUF + 2 MB tokenizer + 135 MB BGE = ~2.55 GB total. Parent design said 2.5 GB free required. **Slightly over.** | Bump the parent design's pre-check to 3.0 GB free in Plan 1.5 brainstorming. Not blocking for Plan 1.4. |
| Tokenizer URL fallback — if `microsoft/Phi-3-mini-4k-instruct-gguf` doesn't ship `tokenizer.json` | Task 2 Step 1 documents fallback to `microsoft/Phi-3-mini-4k-instruct/resolve/main/tokenizer.json`. Both MIT, unauthenticated. |

---

## Verification (post-merge, optional manual smoke)

```bash
FLOWSHIELD_AI_TESTS=1 \
  FLOWSHIELD_AI_TEST_MODELS_DIR=$HOME/.local/share/app.flowshield.desktop/models \
  cargo test --manifest-path desktop-app-v3/src-tauri/Cargo.toml \
  --lib ai::candle_llm::tests::real_generation -- --nocapture
```

**Phase 1.4 → Phase 1.5 graduation criteria:**
- `real_generation` produces grammatical, on-topic text (manual eyeball — not asserted in test).
- RAM ceiling measured (target was <2.5 GB; flag if Phi-3 Q4 exceeds).
- `cargo test --lib` passes with 81 tests.
- PR for Plan 1.4 merged into main.

Plan 1.5 (briefing pipeline + BriefingCard UI) is the next step after this lands.
