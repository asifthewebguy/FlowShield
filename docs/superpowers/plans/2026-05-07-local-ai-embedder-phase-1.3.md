# FlowShield Local AI — Concrete BGE-small Embedder (Phase 1.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a real `CandleEmbedder` that loads BGE-small-en-v1.5 from disk and produces 384-dim L2-normalized embeddings via `candle-transformers`. Replaces the temporary `MockEmbedder` for production code paths so Plan 1.5 (briefing) can index real session/activity chunks. Also fills the three placeholder sha256 hashes in `ai/registry.rs::EMBEDDER_FILES` with values computed against the real downloaded artifacts.

**Architecture:** Pure-Rust BERT inference. `candle-core` provides tensors + the CPU backend (no CUDA dep — desktop targets CPU only in v1). `candle-transformers::models::bert::BertModel` parses the safetensors weights and runs the forward pass. `tokenizers` (HuggingFace) loads `tokenizer.json` and produces input_ids / attention_mask / token_type_ids. Mean-pool over the last hidden state, L2-normalize, return `Vec<f32>` of length 384. Inference is CPU-bound and ~50 ms per chunk; we wrap the sync forward in `tokio::task::block_in_place` so the async `Embedder::embed` trait method doesn't starve the runtime.

**No tokenizer-as-Tauri-state changes.** `CandleEmbedder` is constructed once on first use (lazy `OnceLock` in Plan 1.5 land), holds the `BertModel` + `Tokenizer` for the process lifetime. Memory ceiling ≈ 130 MB resident.

**Tech Stack:** Rust 2021, `candle-core = "0.8"` (new), `candle-nn = "0.8"` (new — `VarBuilder`), `candle-transformers = "0.8"` (new — `BertModel`), `tokenizers = "0.20"` (new — `Tokenizer::from_file`), `safetensors = "0.4"` (new — implicit via candle but pinned), `async-trait` (existing from Plan 1.1), `tokio` (existing).

**Reference parent spec:** [/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md](/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md) — design doc approved 2026-05-05.
**Predecessor plans:**
- [docs/superpowers/plans/2026-05-05-local-ai-substrate-phase-1.1.md](2026-05-05-local-ai-substrate-phase-1.1.md) (PR #70, merged in `fb32bfb`) — `Embedder` trait + `EMBEDDING_DIM = 384` + `MockEmbedder`.
- [docs/superpowers/plans/2026-05-06-local-ai-model-download-phase-1.2.md](2026-05-06-local-ai-model-download-phase-1.2.md) (PR #72, merged in `faee56a`) — registry with placeholder sha256s; downloader fetches the real artifacts when launched.

---

## File structure

**New files:**
- `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs` — `CandleEmbedder` struct, `load(model_dir)` constructor, `embed_sync` forward pass, `Embedder` async impl.

**Modified files:**
- `desktop-app-v3/src-tauri/Cargo.toml` — add `candle-core`, `candle-nn`, `candle-transformers`, `tokenizers`, `safetensors` (all pinned to 0.8 / 0.20 / 0.4).
- `desktop-app-v3/src-tauri/src/ai/mod.rs` — `pub mod candle_embedder;`.
- `desktop-app-v3/src-tauri/src/ai/registry.rs` — replace the three `sha256: ""` placeholders for BGE-small files (`model.safetensors`, `tokenizer.json`, `config.json`) with real lowercase-hex hashes; refresh the comment to mark them filled.
- `desktop-app-v3/src-tauri/src/error.rs` — extend `AiError` with a `Tokenize(String)` variant if not already present (already has `ModelLoad`, `Inference`).

**Out of scope** (defer to later sub-plans):
- Concrete `CandleLlmRuntime` impl of `LlmRuntime` trait → **Plan 1.4**
- Briefing pipeline (`briefing.rs`, `scheduler.rs`, BriefingCard) → **Plan 1.5**
- Reflection dialog + scheduler → **Plan 1.6**
- Settings page UI / labs gate → **Plan 1.7**
- Wiring `CandleEmbedder` into a Tauri-managed singleton (Plan 1.5 owns this — it's the first caller).
- GPU acceleration (Metal / CUDA) — desktop targets CPU only in v1; Metal can be a Plan 2.x optimization on Apple Silicon.

---

## Tasks

### Task 1: Branch + add candle / tokenizers / safetensors deps

**Files:** Modify `desktop-app-v3/src-tauri/Cargo.toml`.

- [ ] **Step 1: Branch from main**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git checkout main
git pull --ff-only
git checkout -b feat/local-ai-embedder
```

- [ ] **Step 2: Add deps to `[dependencies]`**

In `desktop-app-v3/src-tauri/Cargo.toml`, append after the existing AI substrate block (after `futures-util = "0.3"`):

```toml
# Plan 1.3 — concrete BGE-small embedder.
# candle is HuggingFace's pure-Rust ML framework; we use the CPU backend only
# in v1. candle-transformers ships a BertModel that parses the safetensors
# weights and runs the forward pass. Pinned to 0.8 so a candle 0.9 minor
# release can't break our forward-pass call shape mid-sprint.
candle-core         = { version = "0.8", default-features = false }
candle-nn           = { version = "0.8", default-features = false }
candle-transformers = { version = "0.8", default-features = false }

# HuggingFace tokenizer — loads tokenizer.json and produces input_ids /
# attention_mask / token_type_ids tensors. `onig` regex backend disabled to
# avoid the C++ dep on Windows; the default `unicode` regex backend is fine
# for BGE-small's WordPiece tokenizer.
tokenizers = { version = "0.20", default-features = false, features = ["onig" ] }

# Pinned safetensors so a transitive candle bump can't pull a breaking 0.5.
safetensors = "0.4"
```

> **Pin rationale:** candle's API has shifted on minor versions (e.g. `BertModel::forward` signature changed across 0.6 → 0.7 → 0.8). Pinning the trio to 0.8 prevents a `cargo update` six months later from silently breaking inference. The lockfile pins everything anyway, but explicit `Cargo.toml` pins document intent.

> **`tokenizers` `onig` feature note:** if Linux CI fails with linker errors about `onig_*` symbols, switch to `default-features = false, features = []` — the `unicode` regex backend (default in tokenizers ≥ 0.20) is sufficient for BertWordPiece. Keep this fallback in mind during Step 3.

- [ ] **Step 3: Verify build**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -30
```

Expected: clean build, candle + tokenizers + safetensors crates compile. First build will be slow (~2 minutes — candle pulls a lot of transitive code). If `tokenizers` fails on `onig` linker errors, swap to `features = []` and re-run.

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/Cargo.toml desktop-app-v3/src-tauri/Cargo.lock
git commit -m "chore(desktop-v3): add candle + tokenizers deps for AI embedder"
```

---

### Task 2: Compute real sha256 hashes + replace registry placeholders

**Files:** Modify `desktop-app-v3/src-tauri/src/ai/registry.rs`.

The downloader already verifies sha256 against the registry, with empty-string placeholders treated as "skip verify". Plan 1.3's first user-visible job is replacing those with real hashes, so the Plan 1.2 downloader becomes a real integrity check on the embedder bundle.

- [ ] **Step 1: Download the three BGE-small files locally**

```bash
mkdir -p /tmp/bge-real-hashes
cd /tmp/bge-real-hashes
curl -L -o model.safetensors https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/model.safetensors
curl -L -o tokenizer.json     https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/tokenizer.json
curl -L -o config.json        https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/config.json
```

- [ ] **Step 2: Compute lowercase-hex sha256**

```bash
sha256sum /tmp/bge-real-hashes/model.safetensors \
         /tmp/bge-real-hashes/tokenizer.json \
         /tmp/bge-real-hashes/config.json
```

Capture the three hex strings. They look like `a1b2c3...`. Lowercase only — the verifier compares case-insensitively, but our convention is lowercase.

- [ ] **Step 3: Verify expected file sizes match registry constants**

```bash
ls -l /tmp/bge-real-hashes/
```

Expected approximate sizes (registry currently encodes these — refine if the upstream files have changed):

- `model.safetensors` ≈ 135 MB → registry says `135_000_000`
- `tokenizer.json` ≈ 700 KB → registry says `700_000`
- `config.json` ≈ 800 bytes → registry says `800`

If the actual size for any file differs from the registry by more than ±10%, update `size_bytes` in the same edit. Disk-space precheck depends on these being roughly correct.

- [ ] **Step 4: Edit `registry.rs`**

In `desktop-app-v3/src-tauri/src/ai/registry.rs`, for each of the three `EMBEDDER_FILES` entries, replace `sha256: ""` with the real lowercase hex string. Refresh the inline comment from `// PLACEHOLDER — Plan 1.3 fills` to `// real upstream sha256 — verified 2026-05-07`.

Example shape after the edit (use the real hash you captured, not this synthetic):

```rust
ModelFile {
    url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/model.safetensors",
    local_filename: "bge-small-en-v1.5/model.safetensors",
    sha256: "0a1b2c3d4e5f...real_64_char_hex_here",  // real upstream sha256 — verified 2026-05-07
    size_bytes: 135_000_000,
},
```

Update the module-level doc comment (lines 1–13 of `registry.rs`) — the line that reads "PLACEHOLDERS confirmed during Plan 1.3 (embedder) and Plan 1.4 (LLM)" should be amended to: "PLACEHOLDERS for Plan 1.4 (LLM) only — Plan 1.3 filled the embedder hashes."

- [ ] **Step 5: Verify build + run substrate tests**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -5
cargo test --lib ai::registry 2>&1 | tail -20
```

Expected: clean build; existing registry sanity tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/registry.rs
git commit -m "feat(desktop-v3): fill real BGE-small sha256 hashes in registry"
```

---

### Task 3: Create `candle_embedder.rs` scaffold + `Embedder` impl

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs`
- Modify (only if missing): `desktop-app-v3/src-tauri/src/error.rs` — add `AiError::Tokenize(String)` variant if Plan 1.1 didn't already include it.

- [ ] **Step 1: Confirm `AiError::Tokenize` exists**

```bash
grep -n "Tokenize" /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri/src/error.rs
```

If missing, add a variant alongside the existing `ModelLoad` / `Inference` variants:

```rust
#[error("tokenize failed: {0}")]
Tokenize(String),
```

If already present, skip this step.

- [ ] **Step 2: Create `candle_embedder.rs`**

```rust
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
pub struct CandleEmbedder {
    model: BertModel,
    tokenizer: Tokenizer,
    device: Device,
}

impl CandleEmbedder {
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
        // 512. Forward will panic on longer sequences.
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
```

- [ ] **Step 3: Declare module in `ai/mod.rs`**

In `desktop-app-v3/src-tauri/src/ai/mod.rs`, add:

```rust
pub mod candle_embedder;
```

Place it alphabetically between `pub mod corpus;` and `pub mod embedder;` (or wherever fits the existing ordering).

- [ ] **Step 4: Verify build**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -30
```

Expected outcomes (in priority order):

1. **Clean build.** Move on to Task 4.
2. **`BertModel::forward` signature mismatch.** candle 0.8 expects `(input_ids, token_type_ids, attention_mask: Option<&Tensor>)`. If the compiler complains, check the version pulled — `cargo tree -p candle-transformers` — and adapt the call shape.
3. **`Config` deserialization mismatch.** If `serde_json::from_slice::<Config>` errors at runtime (caught in Task 5 tests, not at `cargo check`), the upstream BGE config has fields candle's `Config` doesn't model. Workaround: deserialize into a `serde_json::Value`, hand-pluck fields, build `Config` manually. Defer this until Task 5 test fails.
4. **`tokenizers` linker error on `onig_*`.** Switch the Cargo entry to `default-features = false, features = []` (Task 1 mentioned this fallback).

- [ ] **Step 5: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/candle_embedder.rs \
        desktop-app-v3/src-tauri/src/ai/mod.rs \
        desktop-app-v3/src-tauri/src/error.rs
git commit -m "feat(desktop-v3): CandleEmbedder for BGE-small via candle-transformers"
```

---

### Task 4: Unit tests (mock-only, no real model)

**Files:** Add `#[cfg(test)] mod tests` block at the bottom of `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs`.

These tests run on every `cargo test` and don't need the BGE files on disk. Real-weights testing lives in Task 5 behind an env-flag gate.

- [ ] **Step 1: Append tests block**

```rust
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
}
```

- [ ] **Step 2: Run unit tests**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::candle_embedder 2>&1 | tail -20
```

Expected: 3 passing tests.

- [ ] **Step 3: Run full substrate test suite (no regressions)**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib 2>&1 | tail -10
```

Expected: 75 (Plan 1.2 baseline) + 3 = 78 tests passing.

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/candle_embedder.rs
git commit -m "test(desktop-v3): unit tests for CandleEmbedder load failure paths"
```

---

### Task 5: Gated integration test (real BGE weights)

**Files:** Append to `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs` tests block.

The full forward-pass test needs the ~135 MB safetensors file. We don't want CI to download 135 MB on every push, so we gate the test behind `FLOWSHIELD_AI_TESTS=1` and a fixed test-fixtures path the developer maintains locally.

- [ ] **Step 1: Append gated test**

```rust
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
```

- [ ] **Step 2: Run with real model on dev box**

```bash
mkdir -p ~/flowshield-test-models/bge-small-en-v1.5
cd ~/flowshield-test-models/bge-small-en-v1.5
curl -L -O https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/model.safetensors
curl -L -O https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/tokenizer.json
curl -L -O https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/config.json

cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
FLOWSHIELD_AI_TESTS=1 \
  FLOWSHIELD_AI_TEST_MODELS_DIR=$HOME/flowshield-test-models \
  cargo test --lib ai::candle_embedder::tests::real_forward_pass -- --nocapture 2>&1 | tail -20
```

Expected: 1 passing test, ~5–10 seconds end to end (cold model load dominates).

- [ ] **Step 3: Verify the gate keeps CI silent**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::candle_embedder 2>&1 | tail -10
```

Expected: 4 tests run; `real_forward_pass` prints "skipped: FLOWSHIELD_AI_TESTS != 1" and passes (early-return is treated as a pass).

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/candle_embedder.rs
git commit -m "test(desktop-v3): gated end-to-end CandleEmbedder forward pass"
```

---

### Task 6: Open the PR

- [ ] **Step 1: Push branch**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git push -u origin feat/local-ai-embedder
```

- [ ] **Step 2: Open PR via `gh`**

```bash
gh pr create --title "feat(desktop-v3): concrete BGE-small embedder via candle (Phase 1.3)" \
  --body "$(cat <<'EOF'
## Summary

Phase 1.3 of the Local AI rollout. Lands a real \`CandleEmbedder\` that loads BGE-small-en-v1.5 from disk and produces 384-dim L2-normalized embeddings via \`candle-transformers\`. Replaces \`MockEmbedder\` for production code paths so Plan 1.5 (briefing) can index real session/activity chunks.

Also fills the three placeholder \`sha256: \"\"\` entries in \`ai/registry.rs::EMBEDDER_FILES\` with values computed against the real upstream BGE-small artifacts — the Plan 1.2 downloader now performs a real integrity check on the embedder bundle.

**Predecessor plans:** PR #70 (substrate), PR #72 (downloader infra).
**Plan doc:** \`docs/superpowers/plans/2026-05-07-local-ai-embedder-phase-1.3.md\`.

## What's in

- \`desktop-app-v3/src-tauri/src/ai/candle_embedder.rs\` — \`CandleEmbedder\` struct, \`load(model_dir)\`, sync forward pass (tokenize → BertModel → mean-pool → L2 normalize), async \`Embedder\` impl wrapping the sync path in \`block_in_place\`.
- 4 new unit/integration tests (3 unconditional, 1 gated by \`FLOWSHIELD_AI_TESTS=1\`).
- New deps: \`candle-core\`, \`candle-nn\`, \`candle-transformers\` (all 0.8), \`tokenizers = 0.20\`, \`safetensors = 0.4\`.
- Real sha256 hashes for \`model.safetensors\`, \`tokenizer.json\`, \`config.json\` in \`registry.rs\`.

## What's out (deferred)

- Concrete LLM (\`CandleLlmRuntime\` for Gemma) → Plan 1.4
- Briefing pipeline + BriefingCard → Plan 1.5
- Wiring into Tauri-managed singleton → Plan 1.5 owns the lifetime
- GPU / Metal acceleration → Plan 2.x optimization

## Test plan

- [ ] \`cargo check\` clean
- [ ] \`cargo test --lib\` — 78 tests pass (75 Plan 1.2 baseline + 3 new unconditional)
- [ ] \`cargo test --lib ai::candle_embedder\` — 4 tests, 1 prints "skipped" when env-flag absent
- [ ] With \`FLOWSHIELD_AI_TESTS=1\` + real BGE weights on disk: \`real_forward_pass\` produces unit-norm 384-dim vectors and related sentences score higher cosine than unrelated ones.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Capture PR URL**

`gh pr create` returns the PR URL — paste it back in the conversation so the human reviewer can find it.

---

## Risk callouts

| Risk | Mitigation |
|---|---|
| `BertModel::forward` signature drift across candle minor versions | Pinned candle to 0.8; Task 3 Step 4 documents the expected shape and where to fix if it changes. |
| Upstream BGE `config.json` adds fields candle's `Config` doesn't model | Task 3 Step 4 outcome (3) — fall back to manual deserialization via `serde_json::Value`. |
| `tokenizers` `onig` linker error on Linux/Windows CI | Task 1 Step 2 documents the fallback to `features = []`. |
| `block_in_place` panics on a single-threaded runtime | Tauri's default async runtime is multi-thread (`rt-multi-thread` is in `tokio` features); confirmed in Plan 1.1. If a test runtime needs single-thread, use `spawn_blocking` instead. |
| Mean-pool implementation mismatch silently degrades retrieval | Task 5's `real_forward_pass` test explicitly checks that semantically related sentences score higher cosine — guards against silent regression. |
| Real BGE files change upstream → sha256 drift after merge | Plan 1.4 should re-verify hashes when it adds Gemma; if BGE hashes drift, the Plan 1.2 downloader fails-loud rather than silently mis-loading. Acceptable. |

---

## Verification (post-merge, optional manual smoke)

```bash
# 1. Rebuild release
cd desktop-app-v3
npm run tauri build  # if you have the full build env wired

# 2. From a Rust test binary, load the embedder against the real artifacts
#    the Plan 1.2 downloader has placed in ~/.local/share/app.flowshield.desktop/models/
FLOWSHIELD_AI_TESTS=1 \
  FLOWSHIELD_AI_TEST_MODELS_DIR=$HOME/.local/share/app.flowshield.desktop/models \
  cargo test --manifest-path desktop-app-v3/src-tauri/Cargo.toml \
  --lib ai::candle_embedder::tests::real_forward_pass -- --nocapture
```

Expected: forward pass succeeds against the production-downloaded weights, confirming end-to-end (registry sha256 → downloader → on-disk layout → CandleEmbedder load → forward) is wired correctly.

Plan 1.4 (concrete Gemma LLM) is the next step after this lands.
