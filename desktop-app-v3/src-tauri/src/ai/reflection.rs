//! Evening reflection-question generation. Gathers today's session chunks,
//! prompts the local LLM for ONE specific question, and stores it as a
//! pending ai_reflections row (answer = "") for the user to answer.

use crate::ai::candle_llm::CandleLlmRuntime;
use crate::ai::prompts::{render_reflection_prompt, ReflectionContext};
use crate::ai::runtime::LlmRuntime;
use crate::error::{AiError, AppError};
use crate::store::ai::{self as store_ai, ChunkSource, ModelStatus, Reflection};
use crate::store::Db;
use std::sync::atomic::{AtomicBool, Ordering};

const REFLECTION_MAX_TOKENS: usize = 40;
const REFLECTION_FROM_HOUR_LOCAL: u32 = 18;

/// Gate for evening reflection generation: Local AI on, model Ready, it is
/// past 18:00 local, and today has no reflection row yet.
pub fn should_generate_reflection(
    labs_enabled: bool,
    status: ModelStatus,
    local_hour: u32,
    already_has_row: bool,
) -> bool {
    labs_enabled
        && matches!(status, ModelStatus::Ready)
        && local_hour >= REFLECTION_FROM_HOUR_LOCAL
        && !already_has_row
}

/// Render the reflection prompt over today's session texts and ask the LLM
/// for one short question. Returns the trimmed model output.
pub async fn build_question<L: LlmRuntime + ?Sized>(
    llm: &L,
    session_texts: &[String],
) -> Result<String, AiError> {
    let prompt = render_reflection_prompt(&ReflectionContext { chunks: session_texts });
    let raw = llm.generate(&prompt, REFLECTION_MAX_TOKENS).await?;
    Ok(raw.trim().to_string())
}

/// Build a *pending* reflection row (answer empty) for `date`.
pub fn pending_reflection(date: &str, question: String, now_rfc3339: String) -> Reflection {
    Reflection {
        id: format!("reflection-{date}"),
        date: date.to_string(),
        questions: vec![question],
        answer: String::new(),
        created_at: now_rfc3339,
    }
}

/// RAII guard releasing the in-flight flag on drop (panic-safe).
struct InFlightGuard<'a>(&'a AtomicBool);
impl Drop for InFlightGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Evening pipeline: if today has no reflection row yet and has ≥1 session
/// chunk, prompt the LLM for a question and store it pending. Shares the
/// briefing `in_flight` flag so two Phi-3 loads never overlap. Returns
/// Ok(false) when skipped. Best-effort: the caller logs+swallows the error.
pub async fn generate_and_store_question(
    db: &Db,
    in_flight: &AtomicBool,
    model_dir: &std::path::Path,
    today: chrono::NaiveDate,
) -> Result<bool, AppError> {
    let today_s = today.to_string();

    // Skip if a row already exists for today.
    {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        if store_ai::get_reflection_by_date(&conn, &today_s)?.is_some() {
            return Ok(false);
        }
    } // conn (MutexGuard) drops here — before any await

    // Gather today's session texts. Cutoff = true local midnight expressed as a
    // UTC instant so it lexicographically compares correctly against session
    // chunks whose `created_at` is stored as `DateTime<Utc>.to_rfc3339()`.
    // Using `{today_s}T00:00:00Z` would be UTC midnight labeled with the local
    // date, which silently excludes early-morning sessions in UTC-ahead zones
    // (e.g. Bangladesh UTC+6: a 05:00 local session ends at 23:00 UTC *the
    // previous calendar day* and is dropped by the UTC-midnight cutoff).
    let since = {
        use chrono::{Local, TimeZone};
        match Local
            .from_local_datetime(&today.and_hms_opt(0, 0, 0).expect("00:00:00 is always valid"))
            .single()
        {
            Some(local_midnight) => local_midnight
                .with_timezone(&chrono::Utc)
                .to_rfc3339(),
            // DST gap (clock jumps forward past midnight) — astronomically rare;
            // fall back to UTC-midnight rather than silently skipping the call.
            None => format!("{today_s}T00:00:00Z"),
        }
    };
    let texts = {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        store_ai::list_chunk_texts_for_source_since(&conn, ChunkSource::Session, &since)?
    }; // conn drops here — before any await

    if texts.is_empty() {
        return Ok(false); // nothing to reflect on
    }

    // Acquire the shared LLM in-flight flag; bail if a generation is running.
    if in_flight
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(false);
    }
    let _guard = InFlightGuard(in_flight); // released on drop (even on panic/error)

    // Load model, generate question, drop runtime before touching the db again.
    let runtime = CandleLlmRuntime::load(&model_dir.join("phi-3-mini-4k-instruct"))?;
    let question = build_question(&runtime, &texts).await?; // await while _guard held, no MutexGuard held
    drop(runtime);

    if question.is_empty() {
        return Ok(false);
    }

    let now = chrono::Utc::now().to_rfc3339();
    let row = pending_reflection(&today_s, question, now);
    {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        store_ai::upsert_reflection(&conn, &row)?;
    } // conn drops; _guard drops releasing in_flight flag

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::runtime::MockLlmRuntime;
    use crate::store::ai::ModelStatus;

    #[tokio::test]
    async fn build_question_renders_prompt_and_returns_trimmed_llm_output() {
        let llm = MockLlmRuntime {
            canned_response: "  What blocked your 9am session?  ".to_string(),
            id: "mock-llm-v0",
        };
        let texts = vec!["[Session] Tue 2026-06-23 09:00-09:20 (60min planned, 20min actual).".to_string()];
        let q = build_question(&llm, &texts).await.unwrap();
        assert_eq!(q, "What blocked your 9am session?");
    }

    #[test]
    fn should_generate_reflection_gate() {
        assert!(should_generate_reflection(true, ModelStatus::Ready, 18, false));
        assert!(should_generate_reflection(true, ModelStatus::Ready, 21, false));
        assert!(!should_generate_reflection(true, ModelStatus::Ready, 17, false)); // before 18:00
        assert!(!should_generate_reflection(true, ModelStatus::Ready, 20, true));  // already has today's row
        assert!(!should_generate_reflection(false, ModelStatus::Ready, 20, false)); // labs off
        assert!(!should_generate_reflection(true, ModelStatus::Downloading, 20, false)); // not ready
    }

    #[test]
    fn pending_reflection_has_empty_answer_and_the_question() {
        let r = pending_reflection("2026-06-23", "What went well?".into(), "2026-06-23T18:05:00Z".into());
        assert_eq!(r.date, "2026-06-23");
        assert_eq!(r.questions, vec!["What went well?".to_string()]);
        assert_eq!(r.answer, "");
    }
}
