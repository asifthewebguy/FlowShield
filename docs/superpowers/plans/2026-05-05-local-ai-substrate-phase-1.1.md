# FlowShield Local AI — Substrate (Phase 1.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the LLM/embedder traits, SQLite schema, corpus chunking, RAG retrieval, and prompt templates — the foundation every later sub-plan depends on. Ships nothing user-visible; just unblocks the briefing / reflection / download work that follows in Plans 1.2–1.5.

**Architecture:** New `ai/` module under `desktop-app-v3/src-tauri/src/`. LLM + embedding inference are wrapped in traits (`LlmRuntime`, `Embedder`) so callers always go through the trait — concrete model-loading implementations land in Plan 1.2; this sub-plan ships only mock implementations. SQLite schema extended with 4 new tables in the existing `store/` (no parallel DB). Corpus chunking, cosine-similarity retrieval, and prompt rendering are pure functions tested in isolation — no network, no model weights, no Tauri runtime required to run the test suite.

**Tech Stack:** Rust 2021, Tauri 2 (existing), `rusqlite` (existing), `ndarray` (new for cosine-sim math), `tokio` (existing).

**Reference parent spec:** [/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md](/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md) — the design doc the user approved before this plan was written.

---

## File structure

**New files (substrate scope only):**
- `desktop-app-v3/src-tauri/src/ai/mod.rs` — module entry, declares the 5 sub-modules
- `desktop-app-v3/src-tauri/src/ai/runtime.rs` — `LlmRuntime` trait + `MockLlmRuntime` for tests
- `desktop-app-v3/src-tauri/src/ai/embedder.rs` — `Embedder` trait + `MockEmbedder` for tests
- `desktop-app-v3/src-tauri/src/ai/corpus.rs` — pure functions mapping Session/ActivityLog/Reflection rows → chunk text
- `desktop-app-v3/src-tauri/src/ai/retriever.rs` — cosine-sim + top-k search functions
- `desktop-app-v3/src-tauri/src/ai/prompts.rs` — briefing + reflection prompt templates as Rust constants
- `desktop-app-v3/src-tauri/src/store/ai.rs` — schema migration + CRUD for `ai_chunks` / `ai_reflections` / `ai_briefings` / `ai_model_state`

**Modified files:**
- `desktop-app-v3/src-tauri/Cargo.toml` — add `ndarray = "0.16"`, `async-trait = "0.1"`, `chrono = { version = "0.4", features = ["serde"] }`
- `desktop-app-v3/src-tauri/src/lib.rs` — `mod ai;` declaration (alphabetical order)
- `desktop-app-v3/src-tauri/src/error.rs` — add `AiError::*` variants
- `desktop-app-v3/src-tauri/src/store/mod.rs` — `pub mod ai;` + call `ai::migrate(&conn)` in `Db::open`

**Out of scope for this sub-plan** (each gets its own plan after substrate lands):
- Concrete LLM + embedder implementations using `candle-core` → **Plan 1.2**
- Model download (HuggingFace CDN, resumable, sha256) → **Plan 1.2**
- Briefing generation flow + `BriefingCard.tsx` + tray entry → **Plan 1.3**
- Reflection scheduler + `ReflectionDialog.tsx` + tray entry → **Plan 1.4**
- `/settings/labs` flag + `/settings/ai` page + defer ladder → **Plan 1.5**

---

## Tasks

### Task 1: Branch + add ndarray dependency

**Files:**
- Modify: `desktop-app-v3/src-tauri/Cargo.toml`

- [ ] **Step 1: Branch from main**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git checkout main
git pull --ff-only
git checkout -b feat/local-ai-substrate
```

- [ ] **Step 2: Add the dependency**

In `desktop-app-v3/src-tauri/Cargo.toml`, find the `[dependencies]` block (just below the `semver = "1"` block we added earlier for the update check) and append:

```toml
# AI substrate cosine-similarity math (Plan 1.1). The concrete LLM + embedder
# crates (candle-core, hf-hub, tokenizers) land in Plan 1.2 once the trait
# surface is settled.
ndarray = "0.16"
```

- [ ] **Step 3: Verify the build still passes**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo check 2>&1 | tail -20
```

Expected: `Finished dev [unoptimized + debuginfo] target(s)`. ndarray crate downloaded + indexed.

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/Cargo.toml
git commit -m "chore(desktop-v3): add ndarray dep for AI substrate cosine-sim math"
```

---

### Task 2: Add `AiError` variants to error.rs

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/error.rs`

- [ ] **Step 1: Read the existing file**

Use the Read tool to load `desktop-app-v3/src-tauri/src/error.rs`. Note the existing `AppError` enum shape (it uses `thiserror`).

- [ ] **Step 2: Add the AiError variants**

Add this enum + `From` impl below the existing `AppError`:

```rust
/// Error categories specific to the AI substrate. Wrapped by `AppError::Ai`
/// when bubbled to the Tauri command layer; tests inspect the inner variant
/// directly. Counters of these variants are the only AI telemetry we ship —
/// content (prompts, outputs, embeddings) is never logged.
#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("model not loaded: {0}")]
    ModelLoad(String),

    #[error("model download failed: {0}")]
    ModelDownload(String),

    #[error("inference failed: {0}")]
    Inference(String),

    #[error("tokenizer failed: {0}")]
    Tokenize(String),

    #[error("out of memory during inference")]
    OutOfMemory,

    #[error("disk full: need {needed_mb} MB, have {available_mb} MB")]
    DiskFull { needed_mb: u64, available_mb: u64 },

    #[error("ai feature disabled by user setting")]
    Disabled,

    #[error("ai data corpus has fewer than {min} chunks; need more sessions")]
    InsufficientData { min: usize },
}
```

Then add this conversion to the existing `AppError` enum (find the `#[error(...)]` lines and add a new variant alongside them):

```rust
    #[error("ai: {0}")]
    Ai(#[from] AiError),
```

- [ ] **Step 3: Verify the build**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo check 2>&1 | tail -10
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/error.rs
git commit -m "feat(desktop-v3): add AiError variants for local AI substrate"
```

---

### Task 3: Scaffold the `ai/` module + register in lib.rs

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/mod.rs`
- Create: `desktop-app-v3/src-tauri/src/ai/runtime.rs` (stub)
- Create: `desktop-app-v3/src-tauri/src/ai/embedder.rs` (stub)
- Create: `desktop-app-v3/src-tauri/src/ai/corpus.rs` (stub)
- Create: `desktop-app-v3/src-tauri/src/ai/retriever.rs` (stub)
- Create: `desktop-app-v3/src-tauri/src/ai/prompts.rs` (stub)
- Create: `desktop-app-v3/src-tauri/src/store/ai.rs` (stub)
- Modify: `desktop-app-v3/src-tauri/src/lib.rs`
- Modify: `desktop-app-v3/src-tauri/src/store/mod.rs`

- [ ] **Step 1: Create the ai module entry**

`desktop-app-v3/src-tauri/src/ai/mod.rs`:

```rust
//! Local AI substrate — LLM + embedder traits, corpus chunking, RAG retrieval,
//! and prompt templates. Concrete model loading + inference live in Plan 1.2.

pub mod corpus;
pub mod embedder;
pub mod prompts;
pub mod retriever;
pub mod runtime;
```

- [ ] **Step 2: Create the 5 sub-module stubs**

`desktop-app-v3/src-tauri/src/ai/runtime.rs`:
```rust
//! LLM inference trait + mock for tests. Concrete impl lands in Plan 1.2.
```

`desktop-app-v3/src-tauri/src/ai/embedder.rs`:
```rust
//! Embedding model trait + mock for tests. Concrete impl lands in Plan 1.2.
```

`desktop-app-v3/src-tauri/src/ai/corpus.rs`:
```rust
//! Pure functions mapping Session / ActivityLog / Reflection rows → chunk text
//! ready to embed. No DB or network I/O — input is rows, output is strings.
```

`desktop-app-v3/src-tauri/src/ai/retriever.rs`:
```rust
//! Cosine-similarity top-k search over stored embeddings.
```

`desktop-app-v3/src-tauri/src/ai/prompts.rs`:
```rust
//! Briefing + reflection prompt templates. Constants only — no I/O.
```

- [ ] **Step 3: Create the store sub-module stub**

`desktop-app-v3/src-tauri/src/store/ai.rs`:
```rust
//! AI substrate persistence — schema migration + CRUD for ai_chunks,
//! ai_reflections, ai_briefings, ai_model_state.
```

- [ ] **Step 4: Register `mod ai` in lib.rs**

Read `desktop-app-v3/src-tauri/src/lib.rs`. Find the existing module declarations (e.g. `mod api;`, `mod blocking;`). Add `mod ai;` in alphabetical order — it should sit between `mod api;` (alpha-first existing) and any later ones.

The exact insertion is the line directly **above** `mod api;`:

```rust
mod ai;
mod api;
mod blocking;
// ... existing modules unchanged ...
```

- [ ] **Step 5: Register `pub mod ai` in store/mod.rs**

Read `desktop-app-v3/src-tauri/src/store/mod.rs`. Add `pub mod ai;` to the existing `pub mod` declarations (alphabetical order).

- [ ] **Step 6: Verify the build**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo check 2>&1 | tail -10
```

Expected: success. (No warnings about unused modules — the doc comments suppress that for now.)

- [ ] **Step 7: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/ desktop-app-v3/src-tauri/src/store/ai.rs desktop-app-v3/src-tauri/src/lib.rs desktop-app-v3/src-tauri/src/store/mod.rs
git commit -m "feat(desktop-v3): scaffold ai module structure for local AI substrate"
```

---

### Task 4: Define `LlmRuntime` trait + `MockLlmRuntime`

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/runtime.rs`
- Modify: `desktop-app-v3/src-tauri/Cargo.toml` (add `async-trait`)

- [ ] **Step 1: Add `async-trait` to Cargo.toml**

Open `desktop-app-v3/src-tauri/Cargo.toml`, find `[dependencies]`, append:

```toml
async-trait = "0.1"
```

- [ ] **Step 2: Replace runtime.rs with the trait + mock + tests**

Replace the contents of `desktop-app-v3/src-tauri/src/ai/runtime.rs` with:

```rust
//! LLM inference trait + mock for tests. Concrete impl lands in Plan 1.2.

use crate::error::AiError;
use async_trait::async_trait;

/// Local-LLM inference contract. The substrate (corpus, retriever, prompts)
/// only depends on this trait; concrete implementations (candle-based) land
/// in Plan 1.2. Tests use `MockLlmRuntime` to avoid loading 1.4 GB of weights.
#[async_trait]
pub trait LlmRuntime: Send + Sync {
    /// Generate up to `max_tokens` of completion text from the supplied
    /// prompt. Returns the full output as a single string (streaming token
    /// callbacks are a Plan 1.3 concern, not a substrate one).
    async fn generate(&self, prompt: &str, max_tokens: usize) -> Result<String, AiError>;

    /// Identifier baked into the cache key for `ai_briefings`. When this
    /// changes (e.g. after a model upgrade), every cached briefing is
    /// invalidated and re-generated lazily.
    fn model_id(&self) -> &str;
}

/// In-memory mock returning canned strings. Used by every substrate test
/// that exercises orchestration without the real model.
pub struct MockLlmRuntime {
    pub canned_response: String,
    pub id: &'static str,
}

impl Default for MockLlmRuntime {
    fn default() -> Self {
        Self {
            canned_response: "mock briefing: you focused 3.2h yesterday.".to_string(),
            id: "mock-llm-v0",
        }
    }
}

#[async_trait]
impl LlmRuntime for MockLlmRuntime {
    async fn generate(&self, _prompt: &str, _max_tokens: usize) -> Result<String, AiError> {
        Ok(self.canned_response.clone())
    }
    fn model_id(&self) -> &str {
        self.id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mock_returns_canned_response() {
        let mock = MockLlmRuntime::default();
        let out = mock.generate("anything", 100).await.unwrap();
        assert!(out.contains("mock briefing"));
        assert_eq!(mock.model_id(), "mock-llm-v0");
    }

    #[tokio::test]
    async fn mock_response_can_be_overridden() {
        let mock = MockLlmRuntime {
            canned_response: "custom".to_string(),
            id: "custom-id",
        };
        assert_eq!(mock.generate("p", 1).await.unwrap(), "custom");
        assert_eq!(mock.model_id(), "custom-id");
    }
}
```

- [ ] **Step 3: Run the tests — expect them to pass**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo test --lib ai::runtime::tests 2>&1 | tail -10
```

Expected: `test result: ok. 2 passed`.

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/runtime.rs desktop-app-v3/src-tauri/Cargo.toml
git commit -m "feat(desktop-v3): add LlmRuntime trait + MockLlmRuntime for tests"
```

---

### Task 5: Define `Embedder` trait + `MockEmbedder`

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/embedder.rs`

- [ ] **Step 1: Write trait + mock + tests**

Replace the contents of `desktop-app-v3/src-tauri/src/ai/embedder.rs` with:

```rust
//! Embedding model trait + mock for tests. Concrete impl lands in Plan 1.2.

use crate::error::AiError;
use async_trait::async_trait;

/// Output dimensionality of every supported embedder. BGE-small produces
/// 384-dim vectors; the Plan 1.2 implementation will respect this constant
/// so retriever code can use fixed-size arrays.
pub const EMBEDDING_DIM: usize = 384;

/// Embedding model contract. Inputs go in as text; outputs come back as
/// fixed-length f32 vectors normalized to unit length (so cosine similarity
/// reduces to a dot product downstream).
#[async_trait]
pub trait Embedder: Send + Sync {
    /// Embed a single chunk of text. The output Vec<f32> always has length
    /// `EMBEDDING_DIM`; implementations panic if their underlying model
    /// produces a different dimensionality (which would be a configuration
    /// bug, not a runtime error).
    async fn embed(&self, text: &str) -> Result<Vec<f32>, AiError>;

    /// Batch variant — implementations are encouraged to fuse forward passes.
    /// Default impl just calls `embed` in a loop, but real implementations
    /// override for ~10x throughput on large batches.
    async fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, AiError> {
        let mut out = Vec::with_capacity(texts.len());
        for t in texts {
            out.push(self.embed(t).await?);
        }
        Ok(out)
    }

    /// Identifier baked into `ai_chunks.embedded_at` semantics. When this
    /// changes (rare — a real embedder swap), every chunk needs re-indexing.
    fn embedder_id(&self) -> &str;
}

/// Deterministic mock — hashes input text into a 384-dim unit vector. Used
/// by every substrate test that needs an embedder without loading BGE-small.
pub struct MockEmbedder {
    pub id: &'static str,
}

impl Default for MockEmbedder {
    fn default() -> Self {
        Self { id: "mock-embedder-v0" }
    }
}

#[async_trait]
impl Embedder for MockEmbedder {
    async fn embed(&self, text: &str) -> Result<Vec<f32>, AiError> {
        // Hash the text into 384 deterministic floats by repeatedly mixing
        // bytes. Not cryptographically meaningful — just gives stable embeds
        // for the same input across test runs and varied embeds across inputs.
        let mut v = vec![0f32; EMBEDDING_DIM];
        for (i, b) in text.bytes().enumerate() {
            v[i % EMBEDDING_DIM] += (b as f32) / 255.0;
        }
        // Normalize to unit length.
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-9);
        for x in &mut v {
            *x /= norm;
        }
        Ok(v)
    }
    fn embedder_id(&self) -> &str {
        self.id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mock_embed_produces_fixed_dim_unit_vector() {
        let m = MockEmbedder::default();
        let v = m.embed("hello world").await.unwrap();
        assert_eq!(v.len(), EMBEDDING_DIM);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5, "expected unit length, got {norm}");
    }

    #[tokio::test]
    async fn mock_embed_is_deterministic() {
        let m = MockEmbedder::default();
        let a = m.embed("repeat me").await.unwrap();
        let b = m.embed("repeat me").await.unwrap();
        assert_eq!(a, b);
    }

    #[tokio::test]
    async fn mock_embed_differs_for_different_inputs() {
        let m = MockEmbedder::default();
        let a = m.embed("apple").await.unwrap();
        let b = m.embed("zebra").await.unwrap();
        assert_ne!(a, b);
    }

    #[tokio::test]
    async fn batch_default_works() {
        let m = MockEmbedder::default();
        let out = m.embed_batch(&["a".into(), "b".into()]).await.unwrap();
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].len(), EMBEDDING_DIM);
    }
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo test --lib ai::embedder::tests 2>&1 | tail -10
```

Expected: `test result: ok. 4 passed`.

- [ ] **Step 3: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/embedder.rs
git commit -m "feat(desktop-v3): add Embedder trait + deterministic MockEmbedder"
```

---

### Task 6: Schema migration for the 4 new tables

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs`
- Modify: `desktop-app-v3/src-tauri/src/store/mod.rs`

- [ ] **Step 1: Look at the existing migration pattern**

Read `desktop-app-v3/src-tauri/src/store/mod.rs` and `desktop-app-v3/src-tauri/src/store/pending_sync.rs`. Note how migrations are run on `Db::open`, and how table creation is wrapped in `CREATE TABLE IF NOT EXISTS`.

- [ ] **Step 2: Write the migration function**

Replace the contents of `desktop-app-v3/src-tauri/src/store/ai.rs` with:

```rust
//! AI substrate persistence — schema migration + CRUD for ai_chunks,
//! ai_reflections, ai_briefings, ai_model_state.

use crate::error::AppError;
use rusqlite::{params, Connection};

/// Run all AI-substrate migrations against the open connection. Idempotent —
/// re-running on an already-migrated DB is a no-op (CREATE TABLE IF NOT EXISTS
/// + CREATE INDEX IF NOT EXISTS). Called once during `Db::open`, after the
/// existing migrations.
pub fn migrate(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS ai_chunks (
            id          TEXT PRIMARY KEY,
            source      TEXT NOT NULL,         -- 'session' | 'activity_day' | 'reflection'
            source_ref  TEXT NOT NULL,
            text        TEXT NOT NULL,
            embedding   BLOB NOT NULL,         -- 384 f32s little-endian = 1536 bytes
            created_at  TEXT NOT NULL,         -- RFC3339
            embedded_at TEXT NOT NULL          -- RFC3339; for re-index detection
        );
        CREATE INDEX IF NOT EXISTS idx_ai_chunks_source     ON ai_chunks(source, source_ref);
        CREATE INDEX IF NOT EXISTS idx_ai_chunks_created_at ON ai_chunks(created_at);

        CREATE TABLE IF NOT EXISTS ai_reflections (
            id         TEXT PRIMARY KEY,
            date       TEXT NOT NULL UNIQUE,    -- YYYY-MM-DD; one row per day max
            questions  TEXT NOT NULL,           -- JSON array of question strings
            answer     TEXT NOT NULL,           -- user free text
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_briefings (
            date         TEXT PRIMARY KEY,      -- YYYY-MM-DD; cache, not source
            text         TEXT NOT NULL,         -- generated briefing markdown
            generated_at TEXT NOT NULL,
            model_id     TEXT NOT NULL          -- invalidate cache when LLM upgrades
        );

        CREATE TABLE IF NOT EXISTS ai_model_state (
            id              INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
            model_id        TEXT NOT NULL,
            model_path      TEXT NOT NULL,
            model_sha256    TEXT NOT NULL,
            embedder_id     TEXT NOT NULL,
            embedder_path   TEXT NOT NULL,
            embedder_sha256 TEXT NOT NULL,
            downloaded_at   TEXT,                -- null until both files verified
            status          TEXT NOT NULL        -- 'not_started' | 'downloading' | 'ready' | 'error' | 'disabled'
        );
        "#,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn migrate_creates_all_four_tables() {
        let conn = fresh_conn();
        for tbl in ["ai_chunks", "ai_reflections", "ai_briefings", "ai_model_state"] {
            let row: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?",
                    params![tbl],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(row, 1, "table {tbl} not created");
        }
    }

    #[test]
    fn migrate_is_idempotent() {
        let conn = fresh_conn();
        migrate(&conn).unwrap(); // no panic, no error
        migrate(&conn).unwrap();
    }
}
```

- [ ] **Step 3: Wire the migration into `Db::open`**

Read `desktop-app-v3/src-tauri/src/store/mod.rs`. Find where existing migrations are called (e.g. `pending_sync::migrate(&conn)?` or a `migrations` block). Append the call:

```rust
        ai::migrate(&conn)?;
```

…immediately after the existing migrations.

- [ ] **Step 4: Run the tests**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo test --lib store::ai::tests 2>&1 | tail -10
```

Expected: `test result: ok. 2 passed`.

- [ ] **Step 5: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/store/ai.rs desktop-app-v3/src-tauri/src/store/mod.rs
git commit -m "feat(desktop-v3): add ai_* schema migration to local store"
```

---

### Task 7: ChunkRepo CRUD

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs`

- [ ] **Step 1: Define the `Chunk` struct + insert/list/delete-all functions**

Append to `desktop-app-v3/src-tauri/src/store/ai.rs` (above the `#[cfg(test)] mod tests` block):

```rust
use serde::{Deserialize, Serialize};

/// Represents one row in `ai_chunks`. The `embedding` field is the f32 vector
/// already deserialized from the BLOB; callers never see the raw bytes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub source: ChunkSource,
    pub source_ref: String,
    pub text: String,
    pub embedding: Vec<f32>,
    pub created_at: String,  // RFC3339
    pub embedded_at: String, // RFC3339
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChunkSource {
    Session,
    ActivityDay,
    Reflection,
}

impl ChunkSource {
    fn as_str(self) -> &'static str {
        match self {
            ChunkSource::Session => "session",
            ChunkSource::ActivityDay => "activity_day",
            ChunkSource::Reflection => "reflection",
        }
    }
    fn parse(s: &str) -> Option<Self> {
        match s {
            "session" => Some(ChunkSource::Session),
            "activity_day" => Some(ChunkSource::ActivityDay),
            "reflection" => Some(ChunkSource::Reflection),
            _ => None,
        }
    }
}

fn embedding_to_blob(v: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(v.len() * 4);
    for f in v {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

fn blob_to_embedding(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

pub fn insert_chunk(conn: &Connection, c: &Chunk) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR REPLACE INTO ai_chunks
         (id, source, source_ref, text, embedding, created_at, embedded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![
            c.id,
            c.source.as_str(),
            c.source_ref,
            c.text,
            embedding_to_blob(&c.embedding),
            c.created_at,
            c.embedded_at,
        ],
    )?;
    Ok(())
}

/// Fetch every chunk created on or after `since_rfc3339` (inclusive). Used by
/// the retriever to bound recency before cosine-sim ranking.
pub fn list_chunks_since(conn: &Connection, since_rfc3339: &str) -> Result<Vec<Chunk>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, source, source_ref, text, embedding, created_at, embedded_at
         FROM ai_chunks
         WHERE created_at >= ?
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![since_rfc3339], |r| {
        let source_str: String = r.get(1)?;
        let blob: Vec<u8> = r.get(4)?;
        Ok(Chunk {
            id: r.get(0)?,
            source: ChunkSource::parse(&source_str).unwrap_or(ChunkSource::Session),
            source_ref: r.get(2)?,
            text: r.get(3)?,
            embedding: blob_to_embedding(&blob),
            created_at: r.get(5)?,
            embedded_at: r.get(6)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

pub fn delete_all_chunks(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_chunks", [])?;
    Ok(())
}
```

- [ ] **Step 2: Add tests**

Append to the existing `tests` module (inside the `#[cfg(test)] mod tests {` block, after `migrate_is_idempotent`):

```rust
    fn sample_chunk(id: &str, source: ChunkSource) -> Chunk {
        Chunk {
            id: id.to_string(),
            source,
            source_ref: "ref-1".to_string(),
            text: "sample chunk text".to_string(),
            embedding: vec![0.1; 384],
            created_at: "2026-05-05T10:00:00Z".to_string(),
            embedded_at: "2026-05-05T10:00:00Z".to_string(),
        }
    }

    #[test]
    fn insert_and_list_round_trips_embedding() {
        let conn = fresh_conn();
        let c = sample_chunk("abc", ChunkSource::Session);
        insert_chunk(&conn, &c).unwrap();
        let listed = list_chunks_since(&conn, "2026-05-04T00:00:00Z").unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "abc");
        assert_eq!(listed[0].embedding.len(), 384);
        assert!((listed[0].embedding[0] - 0.1).abs() < 1e-6);
    }

    #[test]
    fn list_chunks_since_filters_by_date() {
        let conn = fresh_conn();
        let mut old = sample_chunk("old", ChunkSource::Session);
        old.created_at = "2025-01-01T00:00:00Z".into();
        let new = sample_chunk("new", ChunkSource::Session);
        insert_chunk(&conn, &old).unwrap();
        insert_chunk(&conn, &new).unwrap();
        let listed = list_chunks_since(&conn, "2026-05-01T00:00:00Z").unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "new");
    }

    #[test]
    fn delete_all_chunks_clears_table() {
        let conn = fresh_conn();
        insert_chunk(&conn, &sample_chunk("a", ChunkSource::Session)).unwrap();
        insert_chunk(&conn, &sample_chunk("b", ChunkSource::Reflection)).unwrap();
        delete_all_chunks(&conn).unwrap();
        let listed = list_chunks_since(&conn, "2025-01-01T00:00:00Z").unwrap();
        assert_eq!(listed.len(), 0);
    }
```

- [ ] **Step 3: Run the tests**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo test --lib store::ai::tests 2>&1 | tail -10
```

Expected: `test result: ok. 5 passed` (3 new + 2 from Task 6).

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/store/ai.rs
git commit -m "feat(desktop-v3): add Chunk CRUD (insert/list-since/delete-all) for ai_chunks"
```

---

### Task 8: ReflectionRepo CRUD

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs`

- [ ] **Step 1: Append `Reflection` struct + CRUD**

Append to `desktop-app-v3/src-tauri/src/store/ai.rs` (above the test module):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reflection {
    pub id: String,
    pub date: String,        // YYYY-MM-DD
    pub questions: Vec<String>,
    pub answer: String,
    pub created_at: String,  // RFC3339
}

pub fn upsert_reflection(conn: &Connection, r: &Reflection) -> Result<(), AppError> {
    let questions_json = serde_json::to_string(&r.questions)
        .map_err(|e| AppError::Other(format!("reflection questions JSON: {e}")))?;
    conn.execute(
        "INSERT INTO ai_reflections (id, date, questions, answer, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
             questions = excluded.questions,
             answer    = excluded.answer,
             created_at = excluded.created_at",
        params![r.id, r.date, questions_json, r.answer, r.created_at],
    )?;
    Ok(())
}

pub fn get_reflection_by_date(conn: &Connection, date: &str) -> Result<Option<Reflection>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, date, questions, answer, created_at
         FROM ai_reflections
         WHERE date = ?",
    )?;
    let mut rows = stmt.query(params![date])?;
    if let Some(row) = rows.next()? {
        let questions_str: String = row.get(2)?;
        let questions: Vec<String> = serde_json::from_str(&questions_str)
            .map_err(|e| AppError::Other(format!("reflection questions parse: {e}")))?;
        Ok(Some(Reflection {
            id: row.get(0)?,
            date: row.get(1)?,
            questions,
            answer: row.get(3)?,
            created_at: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_all_reflections(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_reflections", [])?;
    Ok(())
}
```

If `AppError::Other` doesn't exist, check `error.rs` for an existing variant that carries a `String` payload (e.g. `AppError::Internal`); use that. The intent is "unexpected JSON serialization failure" — wrap whatever variant your `AppError` provides for that.

- [ ] **Step 2: Add tests**

Append to the `tests` module:

```rust
    fn sample_reflection(id: &str, date: &str) -> Reflection {
        Reflection {
            id: id.to_string(),
            date: date.to_string(),
            questions: vec!["What blocked you today?".into()],
            answer: "the api spec was unclear".to_string(),
            created_at: "2026-05-05T20:00:00Z".to_string(),
        }
    }

    #[test]
    fn upsert_and_get_reflection_round_trips() {
        let conn = fresh_conn();
        let r = sample_reflection("rid-1", "2026-05-05");
        upsert_reflection(&conn, &r).unwrap();
        let got = get_reflection_by_date(&conn, "2026-05-05").unwrap().unwrap();
        assert_eq!(got.id, "rid-1");
        assert_eq!(got.questions, vec!["What blocked you today?"]);
        assert_eq!(got.answer, "the api spec was unclear");
    }

    #[test]
    fn upsert_replaces_existing_reflection_for_same_date() {
        let conn = fresh_conn();
        let r1 = sample_reflection("rid-1", "2026-05-05");
        upsert_reflection(&conn, &r1).unwrap();

        let mut r2 = r1.clone();
        r2.answer = "different answer".to_string();
        upsert_reflection(&conn, &r2).unwrap();

        let got = get_reflection_by_date(&conn, "2026-05-05").unwrap().unwrap();
        assert_eq!(got.answer, "different answer");

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM ai_reflections", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1, "should not duplicate rows on upsert");
    }

    #[test]
    fn get_reflection_returns_none_when_missing() {
        let conn = fresh_conn();
        let got = get_reflection_by_date(&conn, "2026-05-05").unwrap();
        assert!(got.is_none());
    }
```

- [ ] **Step 3: Run the tests**

```bash
cargo test --lib store::ai::tests 2>&1 | tail -10
```

Expected: `test result: ok. 8 passed` (3 new + 5 from prior tasks).

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/store/ai.rs
git commit -m "feat(desktop-v3): add Reflection upsert/get/delete CRUD"
```

---

### Task 9: BriefingRepo CRUD (cache layer)

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs`

- [ ] **Step 1: Append `Briefing` struct + cache helpers**

Append to `store/ai.rs` (above tests):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Briefing {
    pub date: String,         // YYYY-MM-DD; PRIMARY KEY
    pub text: String,
    pub generated_at: String, // RFC3339
    pub model_id: String,     // for cache invalidation
}

pub fn upsert_briefing(conn: &Connection, b: &Briefing) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO ai_briefings (date, text, generated_at, model_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
             text         = excluded.text,
             generated_at = excluded.generated_at,
             model_id     = excluded.model_id",
        params![b.date, b.text, b.generated_at, b.model_id],
    )?;
    Ok(())
}

/// Fetch the cached briefing for `date` if it was generated by `current_model_id`.
/// Returns None when (a) no row exists, OR (b) the row's `model_id` doesn't match
/// the active model — which indicates the cache is stale and the caller should
/// re-generate.
pub fn get_briefing_for(
    conn: &Connection,
    date: &str,
    current_model_id: &str,
) -> Result<Option<Briefing>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT date, text, generated_at, model_id
         FROM ai_briefings
         WHERE date = ? AND model_id = ?",
    )?;
    let mut rows = stmt.query(params![date, current_model_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Briefing {
            date: row.get(0)?,
            text: row.get(1)?,
            generated_at: row.get(2)?,
            model_id: row.get(3)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_all_briefings(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_briefings", [])?;
    Ok(())
}
```

- [ ] **Step 2: Add tests**

Append to the `tests` module:

```rust
    fn sample_briefing(date: &str, model_id: &str) -> Briefing {
        Briefing {
            date: date.to_string(),
            text: "you focused 4.2h yesterday".to_string(),
            generated_at: "2026-05-05T08:42:00Z".to_string(),
            model_id: model_id.to_string(),
        }
    }

    #[test]
    fn upsert_and_get_briefing_round_trips() {
        let conn = fresh_conn();
        upsert_briefing(&conn, &sample_briefing("2026-05-05", "gemma-2-2b")).unwrap();
        let got = get_briefing_for(&conn, "2026-05-05", "gemma-2-2b").unwrap().unwrap();
        assert_eq!(got.date, "2026-05-05");
        assert_eq!(got.text, "you focused 4.2h yesterday");
    }

    #[test]
    fn get_briefing_returns_none_when_model_id_changed() {
        let conn = fresh_conn();
        upsert_briefing(&conn, &sample_briefing("2026-05-05", "gemma-2-2b")).unwrap();
        let got = get_briefing_for(&conn, "2026-05-05", "different-model").unwrap();
        assert!(got.is_none(), "stale cache must not be returned");
    }

    #[test]
    fn upsert_replaces_existing_briefing_for_same_date() {
        let conn = fresh_conn();
        upsert_briefing(&conn, &sample_briefing("2026-05-05", "gemma-2-2b")).unwrap();
        let mut updated = sample_briefing("2026-05-05", "gemma-2-2b");
        updated.text = "regenerated text".to_string();
        upsert_briefing(&conn, &updated).unwrap();

        let got = get_briefing_for(&conn, "2026-05-05", "gemma-2-2b").unwrap().unwrap();
        assert_eq!(got.text, "regenerated text");

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM ai_briefings", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }
```

- [ ] **Step 3: Run the tests**

```bash
cargo test --lib store::ai::tests 2>&1 | tail -10
```

Expected: `test result: ok. 11 passed`.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/store/ai.rs
git commit -m "feat(desktop-v3): add Briefing cache CRUD with model-id invalidation"
```

---

### Task 10: ModelStateRepo CRUD (singleton)

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs`

- [ ] **Step 1: Append `ModelState` struct + singleton get/set**

Append to `store/ai.rs` (above tests):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModelStatus {
    NotStarted,
    Downloading,
    Ready,
    Error,
    Disabled,
}

impl ModelStatus {
    fn as_str(&self) -> &'static str {
        match self {
            ModelStatus::NotStarted => "not_started",
            ModelStatus::Downloading => "downloading",
            ModelStatus::Ready => "ready",
            ModelStatus::Error => "error",
            ModelStatus::Disabled => "disabled",
        }
    }
    fn parse(s: &str) -> Option<Self> {
        match s {
            "not_started" => Some(ModelStatus::NotStarted),
            "downloading" => Some(ModelStatus::Downloading),
            "ready" => Some(ModelStatus::Ready),
            "error" => Some(ModelStatus::Error),
            "disabled" => Some(ModelStatus::Disabled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelState {
    pub model_id: String,
    pub model_path: String,
    pub model_sha256: String,
    pub embedder_id: String,
    pub embedder_path: String,
    pub embedder_sha256: String,
    pub downloaded_at: Option<String>, // RFC3339, null until verified
    pub status: ModelStatus,
}

pub fn get_model_state(conn: &Connection) -> Result<Option<ModelState>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT model_id, model_path, model_sha256, embedder_id, embedder_path,
                embedder_sha256, downloaded_at, status
         FROM ai_model_state
         WHERE id = 1",
    )?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let status_str: String = row.get(7)?;
        Ok(Some(ModelState {
            model_id: row.get(0)?,
            model_path: row.get(1)?,
            model_sha256: row.get(2)?,
            embedder_id: row.get(3)?,
            embedder_path: row.get(4)?,
            embedder_sha256: row.get(5)?,
            downloaded_at: row.get(6)?,
            status: ModelStatus::parse(&status_str).unwrap_or(ModelStatus::NotStarted),
        }))
    } else {
        Ok(None)
    }
}

pub fn upsert_model_state(conn: &Connection, m: &ModelState) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO ai_model_state
         (id, model_id, model_path, model_sha256, embedder_id, embedder_path,
          embedder_sha256, downloaded_at, status)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
             model_id        = excluded.model_id,
             model_path      = excluded.model_path,
             model_sha256    = excluded.model_sha256,
             embedder_id     = excluded.embedder_id,
             embedder_path   = excluded.embedder_path,
             embedder_sha256 = excluded.embedder_sha256,
             downloaded_at   = excluded.downloaded_at,
             status          = excluded.status",
        params![
            m.model_id,
            m.model_path,
            m.model_sha256,
            m.embedder_id,
            m.embedder_path,
            m.embedder_sha256,
            m.downloaded_at,
            m.status.as_str(),
        ],
    )?;
    Ok(())
}

pub fn delete_model_state(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_model_state", [])?;
    Ok(())
}
```

- [ ] **Step 2: Add tests**

Append to tests module:

```rust
    fn sample_model_state(status: ModelStatus) -> ModelState {
        ModelState {
            model_id: "gemma-2-2b-q4_k_m".to_string(),
            model_path: "/tmp/gemma.gguf".to_string(),
            model_sha256: "abc".to_string(),
            embedder_id: "bge-small".to_string(),
            embedder_path: "/tmp/bge.gguf".to_string(),
            embedder_sha256: "def".to_string(),
            downloaded_at: None,
            status,
        }
    }

    #[test]
    fn get_model_state_returns_none_initially() {
        let conn = fresh_conn();
        assert!(get_model_state(&conn).unwrap().is_none());
    }

    #[test]
    fn upsert_then_get_round_trips() {
        let conn = fresh_conn();
        upsert_model_state(&conn, &sample_model_state(ModelStatus::Downloading)).unwrap();
        let got = get_model_state(&conn).unwrap().unwrap();
        assert_eq!(got.model_id, "gemma-2-2b-q4_k_m");
        assert_eq!(got.status, ModelStatus::Downloading);
    }

    #[test]
    fn upsert_is_singleton_no_duplicate_rows() {
        let conn = fresh_conn();
        upsert_model_state(&conn, &sample_model_state(ModelStatus::NotStarted)).unwrap();
        upsert_model_state(&conn, &sample_model_state(ModelStatus::Ready)).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM ai_model_state", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        let got = get_model_state(&conn).unwrap().unwrap();
        assert_eq!(got.status, ModelStatus::Ready);
    }
```

- [ ] **Step 3: Run the tests**

```bash
cargo test --lib store::ai::tests 2>&1 | tail -10
```

Expected: `test result: ok. 14 passed`.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/store/ai.rs
git commit -m "feat(desktop-v3): add ModelState singleton CRUD with status enum"
```

---

### Task 11: Corpus per-session chunking

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/corpus.rs`
- Modify: `desktop-app-v3/src-tauri/Cargo.toml` (add `chrono`)

- [ ] **Step 1: Add `chrono` to Cargo.toml**

Open `desktop-app-v3/src-tauri/Cargo.toml` and append under `[dependencies]`:

```toml
chrono = { version = "0.4", features = ["serde"] }
```

- [ ] **Step 2: Define the input row + chunking function**

Replace contents of `desktop-app-v3/src-tauri/src/ai/corpus.rs`:

```rust
//! Pure functions mapping Session / ActivityLog / Reflection rows → chunk text
//! ready to embed. No DB or network I/O — input is rows, output is strings.

use chrono::{DateTime, Utc};

/// Subset of the Session table we need to render a per-session chunk.
/// Defined locally so the corpus module doesn't depend on the API types.
#[derive(Debug, Clone)]
pub struct SessionChunkInput {
    pub id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub planned_duration: i32,           // minutes
    pub actual_duration: Option<i32>,    // minutes
    pub project_name: Option<String>,
    pub productivity_score: Option<i32>, // 0-100
    pub top_apps: Vec<(String, i32)>,    // (process_name, minutes); pre-sorted by minutes desc
}

/// Render one session into the chunk text used by the embedder + LLM.
/// Format anchored by `golden_session_chunk` test — change with care.
pub fn render_session_chunk(s: &SessionChunkInput) -> String {
    let date = s.start_time.format("%a %Y-%m-%d");
    let start = s.start_time.format("%H:%M");
    let end = s
        .end_time
        .map(|e| e.format("%H:%M").to_string())
        .unwrap_or_else(|| "??".to_string());

    let actual = s
        .actual_duration
        .map(|m| m.to_string())
        .unwrap_or_else(|| "?".into());

    let project = s
        .project_name
        .as_deref()
        .map(|n| format!(" Project: {n}."))
        .unwrap_or_default();

    let prod = s
        .productivity_score
        .map(|p| format!(" Productivity {p}/100."))
        .unwrap_or_default();

    let apps = if s.top_apps.is_empty() {
        String::new()
    } else {
        let parts: Vec<String> = s
            .top_apps
            .iter()
            .take(5)
            .map(|(n, m)| format!("{n} {m}m"))
            .collect();
        format!(" Top apps: {}.", parts.join(", "))
    };

    format!(
        "[Session] {date} {start}-{end} ({planned}min planned, {actual}min actual).{project}{prod}{apps}",
        planned = s.planned_duration,
    )
}
```

- [ ] **Step 3: Write the failing test**

Append to `corpus.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample_input() -> SessionChunkInput {
        SessionChunkInput {
            id: "sid-1".into(),
            start_time: Utc.with_ymd_and_hms(2026, 5, 12, 9, 30, 0).unwrap(),
            end_time: Some(Utc.with_ymd_and_hms(2026, 5, 12, 10, 57, 0).unwrap()),
            planned_duration: 90,
            actual_duration: Some(87),
            project_name: Some("AuthRefactor".into()),
            productivity_score: Some(80),
            top_apps: vec![
                ("VSCode".into(), 65),
                ("Slack".into(), 12),
                ("Chrome".into(), 10),
            ],
        }
    }

    #[test]
    fn golden_session_chunk() {
        let chunk = render_session_chunk(&sample_input());
        let expected = "[Session] Tue 2026-05-12 09:30-10:57 (90min planned, 87min actual). \
                        Project: AuthRefactor. Productivity 80/100. \
                        Top apps: VSCode 65m, Slack 12m, Chrome 10m.";
        assert_eq!(chunk, expected);
    }

    #[test]
    fn chunk_omits_optional_fields_when_missing() {
        let mut s = sample_input();
        s.project_name = None;
        s.productivity_score = None;
        s.top_apps.clear();
        let chunk = render_session_chunk(&s);
        assert!(chunk.contains("[Session]"));
        assert!(!chunk.contains("Project:"));
        assert!(!chunk.contains("Productivity"));
        assert!(!chunk.contains("Top apps:"));
    }
}
```

- [ ] **Step 4: Run the tests**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo test --lib ai::corpus::tests 2>&1 | tail -10
```

Expected: `test result: ok. 2 passed`.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/corpus.rs desktop-app-v3/src-tauri/Cargo.toml
git commit -m "feat(desktop-v3): add per-session corpus chunking with golden test"
```

---

### Task 12: Corpus per-day-summary chunking

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/corpus.rs`

- [ ] **Step 1: Append the day-summary input + render function**

Append to `corpus.rs` (above the tests module):

```rust
/// Aggregated stats for a single calendar day. Generated by a nightly
/// indexer job that rolls Sessions + ActivityLogs into one summary chunk.
#[derive(Debug, Clone)]
pub struct DayChunkInput {
    pub date: chrono::NaiveDate,
    pub session_count: i32,
    pub total_focus_minutes: i32,
    pub best_window: Option<String>,        // e.g. "9-11am"
    pub top_apps: Vec<(String, i32)>,       // (name, minutes), sorted desc
    pub lowest_productivity_label: Option<String>, // e.g. "email triage"
}

pub fn render_day_chunk(d: &DayChunkInput) -> String {
    let date = d.date.format("%a %Y-%m-%d");
    let hours = d.total_focus_minutes as f32 / 60.0;
    let best = d
        .best_window
        .as_deref()
        .map(|w| format!(" Best window {w}."))
        .unwrap_or_default();
    let apps = if d.top_apps.is_empty() {
        String::new()
    } else {
        let parts: Vec<String> = d
            .top_apps
            .iter()
            .take(3)
            .map(|(n, m)| format!("{n} {}h{}m", m / 60, m % 60))
            .collect();
        format!(" Top apps: {}.", parts.join(", "))
    };
    let lowest = d
        .lowest_productivity_label
        .as_deref()
        .map(|l| format!(" Lowest productivity: {l}."))
        .unwrap_or_default();

    format!(
        "[Day] {date}. {sc} sessions, {hours:.1}h focused.{best}{apps}{lowest}",
        sc = d.session_count,
    )
}
```

- [ ] **Step 2: Add tests**

Append to the `tests` module:

```rust
    #[test]
    fn golden_day_chunk() {
        let d = DayChunkInput {
            date: chrono::NaiveDate::from_ymd_opt(2026, 5, 12).unwrap(),
            session_count: 4,
            total_focus_minutes: 216,
            best_window: Some("9-11am".into()),
            top_apps: vec![
                ("VSCode".into(), 120),
                ("Slack".into(), 35),
                ("Chrome".into(), 28),
            ],
            lowest_productivity_label: Some("email triage".into()),
        };
        let chunk = render_day_chunk(&d);
        let expected = "[Day] Tue 2026-05-12. 4 sessions, 3.6h focused. \
                        Best window 9-11am. \
                        Top apps: VSCode 2h0m, Slack 0h35m, Chrome 0h28m. \
                        Lowest productivity: email triage.";
        assert_eq!(chunk, expected);
    }

    #[test]
    fn day_chunk_handles_zero_sessions() {
        let d = DayChunkInput {
            date: chrono::NaiveDate::from_ymd_opt(2026, 5, 12).unwrap(),
            session_count: 0,
            total_focus_minutes: 0,
            best_window: None,
            top_apps: vec![],
            lowest_productivity_label: None,
        };
        let chunk = render_day_chunk(&d);
        assert_eq!(chunk, "[Day] Tue 2026-05-12. 0 sessions, 0.0h focused.");
    }
```

- [ ] **Step 3: Run the tests**

```bash
cargo test --lib ai::corpus::tests 2>&1 | tail -10
```

Expected: `test result: ok. 4 passed`.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/corpus.rs
git commit -m "feat(desktop-v3): add per-day-summary corpus chunking"
```

---

### Task 13: Corpus per-reflection chunking

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/corpus.rs`

- [ ] **Step 1: Append reflection input + render**

Append to `corpus.rs` (above tests):

```rust
#[derive(Debug, Clone)]
pub struct ReflectionChunkInput {
    pub date: chrono::NaiveDate,
    pub questions: Vec<String>,
    pub answer: String,
}

pub fn render_reflection_chunk(r: &ReflectionChunkInput) -> String {
    let date = r.date.format("%a %Y-%m-%d");
    let q = r.questions.first().map(String::as_str).unwrap_or("(no question)");
    format!("[Reflection] {date}. Q: '{q}' A: '{a}'", a = r.answer)
}
```

- [ ] **Step 2: Add tests**

Append to tests:

```rust
    #[test]
    fn golden_reflection_chunk() {
        let r = ReflectionChunkInput {
            date: chrono::NaiveDate::from_ymd_opt(2026, 5, 12).unwrap(),
            questions: vec!["You stopped design at 47/60 — anything blocking?".into()],
            answer: "API spec from product is unclear. Need to ping Maya tomorrow.".into(),
        };
        let chunk = render_reflection_chunk(&r);
        let expected = "[Reflection] Tue 2026-05-12. \
                        Q: 'You stopped design at 47/60 — anything blocking?' \
                        A: 'API spec from product is unclear. Need to ping Maya tomorrow.'";
        assert_eq!(chunk, expected);
    }

    #[test]
    fn reflection_chunk_handles_missing_question() {
        let r = ReflectionChunkInput {
            date: chrono::NaiveDate::from_ymd_opt(2026, 5, 12).unwrap(),
            questions: vec![],
            answer: "raw entry".into(),
        };
        let chunk = render_reflection_chunk(&r);
        assert!(chunk.contains("(no question)"));
        assert!(chunk.contains("raw entry"));
    }
```

- [ ] **Step 3: Run the tests**

```bash
cargo test --lib ai::corpus::tests 2>&1 | tail -10
```

Expected: `test result: ok. 6 passed`.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/corpus.rs
git commit -m "feat(desktop-v3): add per-reflection corpus chunking"
```

---

### Task 14: Retriever — cosine similarity primitive

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/retriever.rs`

- [ ] **Step 1: Implement + test cosine similarity**

Replace contents of `desktop-app-v3/src-tauri/src/ai/retriever.rs`:

```rust
//! Cosine similarity + top-k search over stored embeddings.
//!
//! For v1 we keep the entire corpus in memory and compare against the query
//! vector. FlowShield's data volume is tiny — even a heavy user has < 10K
//! chunks, so brute-force cosine is fast (<10ms) and avoids pulling in a
//! vector-DB dependency. We can swap to sqlite-vec later if scale demands.

use crate::ai::embedder::EMBEDDING_DIM;

/// Cosine similarity between two vectors of equal length. Both inputs are
/// expected to be unit-normalized (every Embedder we ship returns unit
/// vectors), in which case this reduces to a simple dot product. We don't
/// re-normalize defensively — that would mask bugs upstream.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len(), "cosine_similarity dim mismatch");
    let mut dot = 0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
    }
    dot
}

/// Sanity-check helper used in retriever public API — panics if dims wrong,
/// preventing silent garbage from a model swap.
pub fn assert_dim(v: &[f32]) {
    assert_eq!(v.len(), EMBEDDING_DIM, "expected dim {EMBEDDING_DIM}, got {}", v.len());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit(mut v: Vec<f32>) -> Vec<f32> {
        let n = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        for x in &mut v {
            *x /= n;
        }
        v
    }

    #[test]
    fn identical_vectors_score_one() {
        let v = unit(vec![1.0, 2.0, 3.0]);
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn orthogonal_vectors_score_zero() {
        let a = unit(vec![1.0, 0.0]);
        let b = unit(vec![0.0, 1.0]);
        assert!(cosine_similarity(&a, &b).abs() < 1e-5);
    }

    #[test]
    fn opposite_vectors_score_negative_one() {
        let v = unit(vec![1.0, 2.0, 3.0]);
        let opp: Vec<f32> = v.iter().map(|x| -x).collect();
        assert!((cosine_similarity(&v, &opp) + 1.0).abs() < 1e-5);
    }
}
```

- [ ] **Step 2: Run the tests**

```bash
cargo test --lib ai::retriever::tests 2>&1 | tail -10
```

Expected: `test result: ok. 3 passed`.

- [ ] **Step 3: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/retriever.rs
git commit -m "feat(desktop-v3): add cosine_similarity primitive for retriever"
```

---

### Task 15: Retriever — top-k search over stored chunks

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/retriever.rs`

- [ ] **Step 1: Append `top_k_by_cosine` function**

Append to `retriever.rs` (above the test module):

```rust
use crate::store::ai::Chunk;

/// Rank a list of chunks by cosine similarity to `query` and return the top
/// `k` (or all chunks, whichever is smaller) sorted by similarity descending.
/// Chunks with mismatched embedding dimensionality are skipped silently —
/// this happens transiently during model swaps when the indexer hasn't yet
/// re-embedded older rows.
pub fn top_k_by_cosine(query: &[f32], mut chunks: Vec<Chunk>, k: usize) -> Vec<(Chunk, f32)> {
    assert_dim(query);
    chunks.retain(|c| c.embedding.len() == EMBEDDING_DIM);

    let mut scored: Vec<(Chunk, f32)> = chunks
        .into_iter()
        .map(|c| {
            let sim = cosine_similarity(query, &c.embedding);
            (c, sim)
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(k);
    scored
}
```

- [ ] **Step 2: Add tests**

Append to the tests module:

```rust
    use crate::store::ai::{Chunk, ChunkSource};

    fn make_chunk(id: &str, text: &str, embedding: Vec<f32>) -> Chunk {
        Chunk {
            id: id.into(),
            source: ChunkSource::Session,
            source_ref: id.into(),
            text: text.into(),
            embedding,
            created_at: "2026-05-05T00:00:00Z".into(),
            embedded_at: "2026-05-05T00:00:00Z".into(),
        }
    }

    fn unit_dim384(seed: f32) -> Vec<f32> {
        let mut v = vec![0f32; EMBEDDING_DIM];
        v[0] = seed;
        v[1] = 1.0;
        let n = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        for x in &mut v {
            *x /= n;
        }
        v
    }

    #[test]
    fn top_k_returns_chunks_in_similarity_order() {
        let query = unit_dim384(10.0);
        let chunks = vec![
            make_chunk("near",  "a", unit_dim384(10.0)),    // sim ≈ 1.0 (same as query)
            make_chunk("mid",   "b", unit_dim384(5.0)),     // sim higher than far
            make_chunk("far",   "c", unit_dim384(0.0)),     // sim lowest
        ];
        let ranked = top_k_by_cosine(&query, chunks, 3);
        assert_eq!(ranked.len(), 3);
        assert_eq!(ranked[0].0.id, "near");
        assert_eq!(ranked[1].0.id, "mid");
        assert_eq!(ranked[2].0.id, "far");
        assert!(ranked[0].1 >= ranked[1].1);
        assert!(ranked[1].1 >= ranked[2].1);
    }

    #[test]
    fn top_k_truncates_to_k() {
        let query = unit_dim384(1.0);
        let chunks: Vec<Chunk> = (0..10).map(|i| make_chunk(&format!("c{i}"), "x", unit_dim384(i as f32))).collect();
        let ranked = top_k_by_cosine(&query, chunks, 3);
        assert_eq!(ranked.len(), 3);
    }

    #[test]
    fn top_k_skips_chunks_with_wrong_dim() {
        let query = unit_dim384(1.0);
        let bad = make_chunk("bad", "x", vec![0f32; 100]); // wrong dim
        let good = make_chunk("good", "x", unit_dim384(1.0));
        let ranked = top_k_by_cosine(&query, vec![bad, good], 5);
        assert_eq!(ranked.len(), 1);
        assert_eq!(ranked[0].0.id, "good");
    }
```

- [ ] **Step 3: Run the tests**

```bash
cargo test --lib ai::retriever::tests 2>&1 | tail -10
```

Expected: `test result: ok. 6 passed`.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/retriever.rs
git commit -m "feat(desktop-v3): add top_k_by_cosine retriever with dim-mismatch tolerance"
```

---

### Task 16: Prompts — briefing template

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/prompts.rs`

- [ ] **Step 1: Define the template + render fn**

Replace contents of `desktop-app-v3/src-tauri/src/ai/prompts.rs`:

```rust
//! Briefing + reflection prompt templates. Constants only — no I/O.

/// Used by `briefing.rs` (Plan 1.3) to build the LLM prompt. {} placeholders
/// are substituted by `render_briefing_prompt`.
const BRIEFING_TEMPLATE: &str = "\
You are FlowShield, a personal productivity coach. The user's local
activity data is below. Generate a SHORT briefing (2-3 sentences max) that:
- compares last 7 days to their baseline (use ONLY the numbers given)
- surfaces ONE specific pattern or blocker
- suggests ONE concrete action for today
Be warm but direct. No corporate-speak.

USER DATA:
{chunks}

YESTERDAY'S REFLECTION:
{reflection}

TODAY: {weekday} {date}, {local_time}.

BRIEFING:";

pub struct BriefingContext<'a> {
    pub chunks: &'a [String],
    pub reflection: Option<&'a str>,
    pub weekday: &'a str,
    pub date: &'a str,
    pub local_time: &'a str,
}

pub fn render_briefing_prompt(ctx: &BriefingContext<'_>) -> String {
    let chunks_block = if ctx.chunks.is_empty() {
        "(no recent activity data)".to_string()
    } else {
        ctx.chunks.join("\n")
    };
    let reflection_block = ctx.reflection.unwrap_or("—");

    BRIEFING_TEMPLATE
        .replace("{chunks}", &chunks_block)
        .replace("{reflection}", reflection_block)
        .replace("{weekday}", ctx.weekday)
        .replace("{date}", ctx.date)
        .replace("{local_time}", ctx.local_time)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn briefing_template_substitutes_all_placeholders() {
        let chunks = vec![
            "[Session] Mon 2026-05-04 09:00-09:55 (60min planned, 55min actual).".into(),
            "[Day] Mon 2026-05-04. 3 sessions, 2.5h focused.".into(),
        ];
        let ctx = BriefingContext {
            chunks: &chunks,
            reflection: Some("API spec was unclear; pinged Maya."),
            weekday: "Tuesday",
            date: "May 5",
            local_time: "08:42",
        };
        let prompt = render_briefing_prompt(&ctx);
        assert!(prompt.contains("[Session] Mon 2026-05-04"));
        assert!(prompt.contains("[Day] Mon 2026-05-04"));
        assert!(prompt.contains("API spec was unclear"));
        assert!(prompt.contains("Tuesday May 5, 08:42"));
        assert!(!prompt.contains("{chunks}"));
        assert!(!prompt.contains("{reflection}"));
        assert!(!prompt.contains("{weekday}"));
    }

    #[test]
    fn briefing_template_handles_no_reflection() {
        let ctx = BriefingContext {
            chunks: &[],
            reflection: None,
            weekday: "Tuesday",
            date: "May 5",
            local_time: "08:00",
        };
        let prompt = render_briefing_prompt(&ctx);
        assert!(prompt.contains("(no recent activity data)"));
        assert!(prompt.contains("YESTERDAY'S REFLECTION:\n—"));
    }
}
```

- [ ] **Step 2: Run the tests**

```bash
cargo test --lib ai::prompts::tests 2>&1 | tail -10
```

Expected: `test result: ok. 2 passed`.

- [ ] **Step 3: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/prompts.rs
git commit -m "feat(desktop-v3): add briefing prompt template with substitution"
```

---

### Task 17: Prompts — reflection template

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/prompts.rs`

- [ ] **Step 1: Append reflection template + render fn**

Append to `prompts.rs` (above the tests module):

```rust
const REFLECTION_TEMPLATE: &str = "\
You are FlowShield generating an evening reflection prompt. The user's data
for TODAY is below. Generate ONE short, specific question (max 15 words)
that picks up on something noteworthy from today — a session that ended
early, an unusual app pattern, an outlier productivity score. Skip generic
'how was your day?' — be specific.

TODAY'S DATA:
{chunks}

QUESTION:";

pub struct ReflectionContext<'a> {
    pub chunks: &'a [String],
}

pub fn render_reflection_prompt(ctx: &ReflectionContext<'_>) -> String {
    let chunks_block = if ctx.chunks.is_empty() {
        "(no sessions today yet)".to_string()
    } else {
        ctx.chunks.join("\n")
    };
    REFLECTION_TEMPLATE.replace("{chunks}", &chunks_block)
}
```

- [ ] **Step 2: Add tests**

Append to the tests module:

```rust
    #[test]
    fn reflection_template_substitutes_chunks() {
        let chunks = vec!["[Session] Tue 2026-05-05 09:30-09:47 (60min planned, 17min actual).".into()];
        let p = render_reflection_prompt(&ReflectionContext { chunks: &chunks });
        assert!(p.contains("[Session] Tue 2026-05-05"));
        assert!(!p.contains("{chunks}"));
    }

    #[test]
    fn reflection_template_handles_empty_chunks() {
        let p = render_reflection_prompt(&ReflectionContext { chunks: &[] });
        assert!(p.contains("(no sessions today yet)"));
    }
```

- [ ] **Step 3: Run the tests**

```bash
cargo test --lib ai::prompts::tests 2>&1 | tail -10
```

Expected: `test result: ok. 4 passed`.

- [ ] **Step 4: Run the full ai test suite to confirm nothing regressed**

```bash
cargo test --lib 'ai::' 'store::ai::' 2>&1 | tail -15
```

Expected: ~22 tests pass across runtime/embedder/corpus/retriever/prompts/store::ai.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/prompts.rs
git commit -m "feat(desktop-v3): add reflection prompt template with substitution"
```

---

### Task 18: Open the substrate PR

**Files:**
- (no file changes — this task is the release flow)

- [ ] **Step 1: Confirm the full test suite passes**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo check 2>&1 | tail -5
cargo test --lib 2>&1 | tail -10
```

Expected: build clean, all tests pass (existing + new ~22 ai tests).

- [ ] **Step 2: Push the branch**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git push -u origin feat/local-ai-substrate
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(desktop-v3): local AI substrate — traits, schema, corpus, retriever, prompts" --body "$(cat <<'EOF'
## Summary

First sub-plan of the FlowShield Local AI feature (Phase 1 / v3.4 labs beta). Lands the foundation every later sub-plan depends on:

- \`LlmRuntime\` + \`Embedder\` traits with mock implementations for tests (concrete impls land in Plan 1.2 with candle-core)
- 4 new SQLite tables (\`ai_chunks\`, \`ai_reflections\`, \`ai_briefings\`, \`ai_model_state\`) with idempotent migration + CRUD
- Pure-function corpus chunking for Session / Day-summary / Reflection rows (golden-test anchored)
- Cosine-similarity top-k retriever with dim-mismatch tolerance
- Briefing + reflection prompt templates with substitution
- 8 new \`AiError\` variants threaded through \`AppError\`

**No user-visible UI surface yet** — this PR ships scaffolding only. Subsequent sub-plans (1.2-1.5) wire concrete model loading, briefing/reflection generation, the dashboard card, the tray menu entries, and the labs/settings flag.

## Reference design

Design doc: [\`/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md\`](.claude/plans/ethereal-purring-canyon.md) (approved 2026-05-05).

## Verification

- ✓ \`cargo check\` clean
- ✓ \`cargo test --lib 'ai::' 'store::ai::'\` — ~22 unit tests pass
- ✓ Schema migration is idempotent (re-running on a populated DB is a no-op)
- ✓ Mock implementations let downstream sub-plans test without 1.4 GB of model weights

## Test plan

- [ ] CI green
- [ ] Re-run \`cargo test --lib\` post-merge against main on Linux (this PR's machine)
- [ ] No regressions on existing tests (existing test count unchanged)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Note the PR number for Plan 1.2**

Plan 1.2 will branch off the merged substrate. Save the PR URL printed by `gh pr create` to reference in the next sub-plan's context.

---

## Self-review

**Spec coverage:** Each substrate concern from the design doc has a dedicated task:
- LLM trait + mock → Task 4
- Embedder trait + mock → Task 5
- 4-table schema → Tasks 6-10
- Per-source chunking (3 taxonomies) → Tasks 11-13
- Cosine + top-k → Tasks 14-15
- Both prompt templates → Tasks 16-17
- AiError variants → Task 2
- Module scaffolding → Task 3
- Cargo deps → Tasks 1, 4, 11

**Out-of-scope concerns** (deferred to Plans 1.2-1.5, NOT in this plan):
- Concrete LLM/embedder implementations
- Model download (HF CDN, sha256, resumable)
- Briefing generation orchestration (`briefing.rs`)
- Reflection scheduler (`reflection.rs`, `scheduler.rs`)
- First-run UX, BriefingCard, ReflectionDialog, settings page, labs flag

**Placeholder scan:** No `TBD`, `TODO`, or "implement later" found. Each step has either a concrete code block, an exact command, or a specific git commit message. One ambiguity flagged in Task 8 step 1: if `AppError::Other` doesn't exist, the executor must check `error.rs` and use the equivalent variant — this is a known unknown about the existing error enum's shape and is explicitly called out, not papered over.

**Type consistency:** Single source of truth in `store/ai.rs` for `Chunk`, `ChunkSource`, `Reflection`, `Briefing`, `ModelState`, `ModelStatus`. Retriever's `top_k_by_cosine` consumes `Chunk` directly. Corpus module's `SessionChunkInput` / `DayChunkInput` / `ReflectionChunkInput` are intentionally separate from store types (they're the inputs to chunk-rendering, not rows). `EMBEDDING_DIM = 384` constant exposed from `embedder.rs` and re-used in `retriever.rs::assert_dim`.

**Cross-task references verified:** `crate::error::AiError` (defined Task 2) used by Tasks 4, 5. `crate::store::ai::{Chunk, ChunkSource}` (defined Tasks 6-7) used by Tasks 14-15. `crate::ai::embedder::EMBEDDING_DIM` (defined Task 5) used by Task 14.

---

## Verification (run before opening the PR)

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri

# 1. Build clean
cargo check 2>&1 | tail -5

# 2. Full test suite — should be ~22 new tests + all existing
cargo test --lib 2>&1 | tail -15

# 3. Specifically the substrate tests (sanity check)
cargo test --lib 'ai::' 'store::ai::' 2>&1 | tail -10

# 4. Confirm no warnings on the new code
cargo clippy --lib -- -D warnings 2>&1 | tail -10

# 5. Confirm the migration is wired into Db::open
grep -n "ai::migrate" /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri/src/store/mod.rs
# Expect: one match in the open() function
```

**Cross-platform smoke (post-merge, on each platform that builds the app):**

```bash
# Linux + macOS auto-build via .github/workflows/desktop-v3-release.yml on the next tag.
# This sub-plan ships no UI, so manual smoke is just "app boots, tables created":
cd desktop-app-v3 && npm run tauri:dev
# In a separate terminal:
sqlite3 ~/.local/share/app.flowshield.desktop/local.sqlite \
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%';"
# Expect 4 rows: ai_chunks, ai_reflections, ai_briefings, ai_model_state
```

**Plan 1.2 (Model download + concrete LLM) starts** once this PR merges. Plan 1.2 will:
- Add `candle-core`, `candle-transformers`, `candle-nn`, `tokenizers`, `hf-hub` dependencies
- Implement `CandleLlmRuntime` against the `LlmRuntime` trait
- Implement `CandleEmbedder` against the `Embedder` trait
- Add `ai/model_download.rs` with HF CDN + resumable HTTP Range + sha256 verify
- Wire `ModelState` transitions
