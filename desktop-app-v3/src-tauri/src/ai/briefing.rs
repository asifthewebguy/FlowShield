//! Briefing pipeline orchestrator. The single entry point for both the
//! 5am scheduler tick and the lazy dashboard-mount fallback.
//!
//! Design constraints:
//! - **One generation at a time.** A caller-owned `AtomicBool` gates entry;
//!   a second concurrent call returns `Ok(())` early.
//! - **LLM is loaded fresh, used once, dropped.** Plan 1.4's KV cache
//!   isn't resettable in candle 0.8.4, so the runtime is single-use. The
//!   `generate_with_real_models` helper enforces this.
//! - **Drop-guard for in-flight flag.** A panic anywhere inside the
//!   orchestrator must reset the flag so the next tick can try again.
//! - **No mutex guard across `.await`.** `std::sync::Mutex` guards are
//!   `!Send`; reads happen inside a tight block scope, then the lock is
//!   released before the LLM call awaits.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::ai::candle_embedder::CandleEmbedder;
use crate::ai::candle_llm::CandleLlmRuntime;
use crate::ai::embedder::Embedder;
use crate::ai::prompts::{render_briefing_prompt, BriefingContext};
use crate::ai::retriever::top_k_by_cosine;
use crate::ai::runtime::LlmRuntime;
use crate::error::AppError;
use crate::store::ai::{self as store_ai, Briefing, Chunk};
use crate::store::Db;

const BRIEFING_MAX_TOKENS: usize = 200;
const RETRIEVAL_K: usize = 15;
const RETRIEVAL_WINDOW_DAYS: i64 = 7;
const MIN_OUTPUT_LEN: usize = 5;

/// RAII guard that flips the `in_flight` flag back to `false` on drop —
/// even if the orchestrator panics.
struct InFlightGuard<'a>(&'a AtomicBool);
impl Drop for InFlightGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Generate today's briefing and write it to `ai_briefings`. Idempotent
/// per (date, model_id): re-running for the same day overwrites the row.
///
/// Returns `Ok(())` early when `in_flight` was already true — the caller
/// that flipped it first owns the work.
pub async fn generate<E, L>(
    db: &Db,
    in_flight: &AtomicBool,
    embedder: &E,
    runtime: &L,
    today: chrono::NaiveDate,
) -> Result<(), AppError>
where
    E: Embedder + ?Sized,
    L: LlmRuntime + ?Sized,
{
    if in_flight
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }
    let _guard = InFlightGuard(in_flight);

    // Synthetic query summarizing what we want from the corpus. Generic
    // on purpose — we want recent context, not a one-topic search.
    let query = format!(
        "Today is {}. Recent focus patterns, blockers, and baselines.",
        today.format("%A %Y-%m-%d")
    );
    let q_vec = embedder.embed(&query).await?;

    // list_chunks_since's parameter is named `since_rfc3339` and the SQL
    // column `created_at` stores RFC 3339 timestamps. Emit a matching shape
    // (lexicographic comparison would coincidentally work for date-only
    // strings, but the contract is RFC 3339 — don't rely on coincidence).
    let since_str = today
        .checked_sub_signed(chrono::Duration::days(RETRIEVAL_WINDOW_DAYS))
        .map(|d| format!("{d}T00:00:00Z"))
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".into());

    // get_reflection_by_date matches against a `date` column (YYYY-MM-DD)
    // not a timestamp, so a plain date string is correct here.
    let yesterday_str = today
        .checked_sub_signed(chrono::Duration::days(1))
        .map(|d| d.to_string())
        .unwrap_or_else(|| "1970-01-01".into());

    // Phase 1: read everything we need from the DB inside one locked
    // block. The mutex guard MUST be dropped before the runtime.generate()
    // await below — std::sync::Mutex guards are !Send.
    let (top_chunks, reflection) = {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        let chunks: Vec<Chunk> = store_ai::list_chunks_since(&conn, &since_str)?;
        let reflection = store_ai::get_reflection_by_date(&conn, &yesterday_str)?;
        let top: Vec<Chunk> = top_k_by_cosine(&q_vec, chunks, RETRIEVAL_K)
            .into_iter()
            .map(|(c, _sim)| c)
            .collect();
        (top, reflection)
    };

    // Build the prompt outside the lock — render_briefing_prompt is pure.
    let chunk_strings: Vec<String> = top_chunks.iter().map(|c| c.text.clone()).collect();
    let reflection_text = reflection.as_ref().map(|r| r.answer.as_str());
    let weekday = today.format("%A").to_string();
    let date_str = today.format("%B %-d").to_string();
    let local_time = chrono::Local::now().format("%H:%M").to_string();

    let prompt = render_briefing_prompt(&BriefingContext {
        chunks: &chunk_strings,
        reflection: reflection_text,
        weekday: &weekday,
        date: &date_str,
        local_time: &local_time,
    });

    // Phase 2: run the LLM (no lock held).
    let text = runtime.generate(&prompt, BRIEFING_MAX_TOKENS).await?;
    let trimmed = text.trim();

    if trimmed.len() < MIN_OUTPUT_LEN {
        tracing::warn!(
            len = trimmed.len(),
            "briefing output too short, skipping cache"
        );
        return Ok(());
    }

    // Phase 3: write the cached briefing back inside a fresh locked block.
    // model_id comes from the runtime itself, not the registry constant —
    // cache invalidation must follow the actual model that produced the
    // text, not whatever the registry thinks it should be.
    let briefing = Briefing {
        date: today.to_string(),
        text: trimmed.to_string(),
        generated_at: chrono::Utc::now().to_rfc3339(),
        model_id: runtime.model_id().to_string(),
    };
    {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        store_ai::upsert_briefing(&conn, &briefing)?;
    }
    tracing::info!(date = %today, len = trimmed.len(), "briefing cached");
    Ok(())
}

/// Production wrapper: load the real candle embedder + LLM, run `generate`,
/// then drop the runtime so the next call gets a fresh KV cache. The
/// embedder is cached in `embedder_slot` because it's stateless and
/// expensive to load (~135 MB safetensors).
pub async fn generate_with_real_models(
    db: &Db,
    in_flight: &AtomicBool,
    embedder_slot: &std::sync::OnceLock<Arc<CandleEmbedder>>,
    model_dir: &Path,
    today: chrono::NaiveDate,
) -> Result<(), AppError> {
    let embedder = CandleEmbedder::get_or_load(embedder_slot, model_dir)?;

    let runtime = CandleLlmRuntime::load(&model_dir.join("phi-3-mini-4k-instruct"))?;

    let result = generate(db, in_flight, embedder.as_ref(), &runtime, today).await;
    drop(runtime);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::embedder::MockEmbedder;
    use crate::ai::runtime::MockLlmRuntime;
    use crate::store;

    /// Open a SQLite DB in a temp dir that lives for the whole test process.
    /// Tempdir is forgotten because `Db` (Arc<Mutex<Connection>>) doesn't
    /// take ownership of the path; dropping the dir mid-test would unlink
    /// the file under us. The OS reclaims it on process exit.
    fn open_test_db() -> Db {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    #[tokio::test]
    async fn generate_writes_to_ai_briefings() {
        let db = open_test_db();
        let in_flight = AtomicBool::new(false);
        let emb = MockEmbedder::default();
        let llm = MockLlmRuntime::default();
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();

        let mock_id = llm.model_id().to_string();
        generate(&db, &in_flight, &emb, &llm, today).await.expect("ok");

        let conn = db.lock().unwrap();
        let row = store_ai::get_briefing_for(&conn, &today.to_string(), &mock_id)
            .expect("ok")
            .expect("some");
        assert!(row.text.contains("mock briefing"));
        assert_eq!(row.model_id, mock_id);
    }

    #[tokio::test]
    async fn generate_returns_ok_when_in_flight_already_true() {
        let db = open_test_db();
        let in_flight = AtomicBool::new(true);
        let emb = MockEmbedder::default();
        let llm = MockLlmRuntime::default();
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        let mock_id = llm.model_id().to_string();

        generate(&db, &in_flight, &emb, &llm, today).await.expect("ok");

        let conn = db.lock().unwrap();
        let row = store_ai::get_briefing_for(&conn, &today.to_string(), &mock_id).expect("ok");
        assert!(row.is_none(), "no row should be written when in_flight already true");
        drop(conn);
        // Flag must remain set — another caller owns the work.
        assert!(in_flight.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn generate_resets_in_flight_on_success() {
        let db = open_test_db();
        let in_flight = AtomicBool::new(false);
        let emb = MockEmbedder::default();
        let llm = MockLlmRuntime::default();
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();

        generate(&db, &in_flight, &emb, &llm, today).await.expect("ok");

        assert!(!in_flight.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn generate_skips_cache_for_empty_output() {
        let db = open_test_db();
        let in_flight = AtomicBool::new(false);
        let emb = MockEmbedder::default();
        let llm = MockLlmRuntime {
            canned_response: "".to_string(),
            id: "mock-llm-v0",
        };
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        let mock_id = llm.model_id().to_string();

        generate(&db, &in_flight, &emb, &llm, today).await.expect("ok");

        let conn = db.lock().unwrap();
        let row = store_ai::get_briefing_for(&conn, &today.to_string(), &mock_id).expect("ok");
        assert!(row.is_none());
    }

    #[test]
    fn briefing_token_cap_allows_full_output() {
        // 80 truncated 2-3 sentence briefings mid-word; 200 lets them finish.
        assert_eq!(super::BRIEFING_MAX_TOKENS, 200);
    }

    /// End-to-end pipeline against real BGE + Phi-3 weights. Skipped
    /// unless FLOWSHIELD_AI_TESTS=1 + FLOWSHIELD_AI_TEST_MODELS_DIR is set.
    #[test]
    fn briefing_pipeline_with_real_models() {
        if std::env::var("FLOWSHIELD_AI_TESTS").ok().as_deref() != Some("1") {
            eprintln!("skipped: FLOWSHIELD_AI_TESTS != 1");
            return;
        }
        let base = match std::env::var("FLOWSHIELD_AI_TEST_MODELS_DIR") {
            Ok(p) => std::path::PathBuf::from(p),
            Err(_) => {
                eprintln!("skipped: FLOWSHIELD_AI_TEST_MODELS_DIR unset");
                return;
            }
        };

        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("rt");

        // Seed enough session chunks to pass has_minimum_data threshold (≥5
        // session chunks in last 7 days). Embeddings are zeroblobs — the
        // test asserts pipeline plumbing, not retrieval quality.
        let db = open_test_db();
        {
            let conn = db.lock().unwrap();
            let now = chrono::Utc::now();
            for i in 0..6 {
                let dt = now - chrono::Duration::days(i);
                conn.execute(
                    "INSERT INTO ai_chunks (id, source, source_ref, text, embedding, created_at, embedded_at) \
                     VALUES (?, 'session', ?, ?, zeroblob(1536), ?, ?)",
                    rusqlite::params![
                        format!("eval-chunk-{}", i),
                        format!("eval-session-{}", i),
                        format!("Worked on coding for 1 hour on day {}.", i),
                        dt.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
                        dt.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
                    ],
                )
                .unwrap();
            }
        }

        let in_flight = std::sync::atomic::AtomicBool::new(false);
        let embedder_slot = std::sync::OnceLock::new();
        let today = chrono::Local::now().date_naive();

        rt.block_on(async {
            super::generate_with_real_models(&db, &in_flight, &embedder_slot, &base, today)
                .await
                .expect("generate");
        });

        // Use whatever model_id the runtime reported; we don't have access
        // to the registry constant here without coupling tightly. The test
        // queries by date alone first to find any cached row.
        let conn = db.lock().unwrap();
        // Query directly: SELECT all rows for today regardless of model_id
        let row: Option<(String, String, String)> = conn
            .query_row(
                "SELECT text, generated_at, model_id FROM ai_briefings WHERE date = ?",
                rusqlite::params![today.to_string()],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok();
        assert!(row.is_some(), "expected a briefing row to be cached");
        let (text, _generated_at, model_id) = row.unwrap();
        eprintln!("Briefing generated with {model_id}: {text:?}");
        assert!(!text.is_empty());
        assert!(text.len() <= 400, "text too long: {} chars", text.len());
    }
}
