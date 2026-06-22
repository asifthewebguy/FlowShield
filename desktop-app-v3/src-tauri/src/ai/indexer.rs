//! Shared corpus indexing: embed chunk text and upsert it as one ai_chunks
//! row. Idempotent via a deterministic id derived from (source, source_ref).

use crate::ai::candle_embedder::CandleEmbedder;
use crate::ai::corpus::{DayChunkInput, SessionChunkInput};
use crate::ai::embedder::Embedder;
use crate::api::Session;
use crate::error::AppError;
use crate::store::ai::{self as store_ai, Chunk, ChunkSource, ModelStatus, SessionFacts};
use crate::store::ai::list_session_facts_for_date;
use crate::store::Db;
use crate::tracker::ActivitySample;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

/// Deterministic row id for an indexed chunk. Same (source, source_ref) →
/// same id → `INSERT OR REPLACE` overwrites instead of duplicating.
/// Note: the `:` separator is collision-free as long as `source_ref` contains no
/// colon — guaranteed for session UUIDs and ISO date strings.
pub fn stable_chunk_id(source: ChunkSource, source_ref: &str) -> String {
    format!("{}:{}", source.as_str(), source_ref)
}

/// Sum tracker samples by application, convert seconds → whole minutes, and
/// return `(app, minutes)` sorted by minutes descending (ties broken by name
/// for a stable order).
pub fn aggregate_top_apps(samples: &[ActivitySample]) -> Vec<(String, i32)> {
    let mut by_app: HashMap<String, u64> = HashMap::new();
    for s in samples {
        *by_app.entry(s.application_name.clone()).or_insert(0) += s.duration_seconds;
    }
    let mut out: Vec<(String, i32)> = by_app
        .into_iter()
        .map(|(app, secs)| (app, (secs / 60) as i32))
        .collect();
    out.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    out
}

/// Build the corpus input for one completed session. Times come off the API
/// `Session` as RFC 3339 strings; unparseable values fall back to "now" /
/// `None` rather than failing the index. `project_name` is `None` in 1.6a —
/// the API `Session` carries only `project_id`; name enrichment is later work.
pub fn session_chunk_input(
    session: &Session,
    productivity_score: Option<i32>,
    samples: &[ActivitySample],
) -> SessionChunkInput {
    let start_time = chrono::DateTime::parse_from_rfc3339(&session.start_time)
        .map(|d| d.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());
    let end_time = session
        .end_time
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&chrono::Utc));

    SessionChunkInput {
        id: session.id.clone(),
        start_time,
        end_time,
        planned_duration: session.planned_duration,
        actual_duration: session.actual_duration,
        project_name: None,
        productivity_score: productivity_score.or(session.productivity_score),
        top_apps: aggregate_top_apps(samples),
    }
}

/// Embed `text` and upsert it as one ai_chunks row. Best-effort callers
/// should log and swallow the error; the function itself surfaces it so
/// tests can assert success.
pub async fn index_chunk<E: Embedder + ?Sized>(
    db: &Db,
    embedder: &E,
    source: ChunkSource,
    source_ref: &str,
    created_at: &str,
    text: String,
) -> Result<(), AppError> {
    tracing::debug!(source = source.as_str(), source_ref, "indexing chunk");
    let embedding = embedder.embed(&text).await?; // AiError -> AppError via From
    let chunk = Chunk {
        id: stable_chunk_id(source, source_ref),
        source,
        source_ref: source_ref.to_string(),
        text,
        embedding,
        created_at: created_at.to_string(),
        embedded_at: chrono::Utc::now().to_rfc3339(),
    };
    let conn = db
        .lock()
        .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
    store_ai::insert_chunk(&conn, &chunk)
}

/// Gate for session indexing. Index only when the user enabled Local AI and
/// the model finished downloading.
pub fn should_index(labs_enabled: bool, status: ModelStatus) -> bool {
    labs_enabled && matches!(status, ModelStatus::Ready)
}

/// Gate for the daily rollup: only when Local AI is on, the model is Ready,
/// and we have not already indexed this day's chunk.
pub fn should_roll_up(labs_enabled: bool, status: ModelStatus, already_exists: bool) -> bool {
    labs_enabled && matches!(status, ModelStatus::Ready) && !already_exists
}

/// Build the structured facts row for one session from the same input used to
/// render its chunk. `date` is the LOCAL calendar day of the session's end
/// time (falls back to start time when end is absent) — day rollups group by
/// local day.
pub fn session_facts(input: &SessionChunkInput) -> SessionFacts {
    let anchor = input.end_time.unwrap_or(input.start_time);
    let date = anchor.with_timezone(&chrono::Local).date_naive().to_string();
    SessionFacts {
        session_id: input.id.clone(),
        date,
        start_time: input.start_time.to_rfc3339(),
        end_time: input.end_time.map(|t| t.to_rfc3339()),
        planned_min: input.planned_duration,
        actual_min: input.actual_duration,
        productivity: input.productivity_score,
        top_apps: input.top_apps.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// Spawn a best-effort background task that renders + indexes one session
/// chunk. Never blocks or fails the caller. Reads the labs flag and model
/// status itself, loads the shared embedder, and indexes the chunk.
pub fn index_session_background(
    app: tauri::AppHandle,
    state_db: Db,
    embedder_slot: Arc<OnceLock<Arc<CandleEmbedder>>>,
    model_dir: PathBuf,
    input: SessionChunkInput,
) {
    tauri::async_runtime::spawn(async move {
        let labs = crate::commands::ai::labs_enabled(&app);
        let status = {
            let conn = match state_db.lock() {
                Ok(c) => c,
                Err(_) => return,
            };
            store_ai::get_model_state(&conn)
                .ok()
                .flatten()
                .map(|s| s.status)
                .unwrap_or(ModelStatus::NotStarted)
        };
        if !should_index(labs, status) {
            return;
        }

        // Persist structured facts first — they need no model and power the
        // day rollup even if embedding later fails.
        {
            let facts = session_facts(&input);
            match state_db.lock() {
                Ok(conn) => {
                    if let Err(e) = store_ai::upsert_session_facts(&conn, &facts) {
                        tracing::warn!(?e, session = %input.id, "session facts upsert failed");
                    }
                }
                Err(_) => return,
            }
        }

        let embedder = match CandleEmbedder::get_or_load(&embedder_slot, &model_dir) {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!(?e, "session index skipped: embedder load failed");
                return;
            }
        };

        let created_at = input
            .end_time
            .unwrap_or_else(chrono::Utc::now)
            .to_rfc3339();
        let text = crate::ai::corpus::render_session_chunk(&input);
        if let Err(e) = index_chunk(
            &state_db,
            embedder.as_ref(),
            ChunkSource::Session,
            &input.id,
            &created_at,
            text,
        )
        .await
        {
            tracing::warn!(?e, session = %input.id, "session chunk index failed");
        } else {
            tracing::info!(session = %input.id, "indexed session chunk");
        }
    });
}

/// Part-of-day bucket for a local hour: <12 morning, 12-16 afternoon, >=17 evening.
pub fn part_of_day(hour: u32) -> &'static str {
    if hour < 12 {
        "morning"
    } else if hour < 17 {
        "afternoon"
    } else {
        "evening"
    }
}

/// The highest-productivity scored session (tie -> larger actual_min). None when
/// no session carries a productivity score.
pub fn pick_best(facts: &[SessionFacts]) -> Option<&SessionFacts> {
    facts
        .iter()
        .filter(|f| f.productivity.is_some())
        .max_by(|a, b| {
            a.productivity
                .cmp(&b.productivity)
                .then_with(|| a.actual_min.unwrap_or(0).cmp(&b.actual_min.unwrap_or(0)))
        })
}

/// The lowest-productivity scored session (tie -> smaller actual_min). Requires
/// at least two scored sessions, so a lone session is never both "best" and
/// "lowest".
pub fn pick_lowest(facts: &[SessionFacts]) -> Option<&SessionFacts> {
    let scored: Vec<&SessionFacts> = facts.iter().filter(|f| f.productivity.is_some()).collect();
    if scored.len() < 2 {
        return None;
    }
    scored.into_iter().min_by(|a, b| {
        a.productivity
            .cmp(&b.productivity)
            .then_with(|| a.actual_min.unwrap_or(0).cmp(&b.actual_min.unwrap_or(0)))
    })
}

/// Parse an RFC 3339 timestamp into local time. None if unparseable.
fn to_local(ts: &str) -> Option<chrono::DateTime<chrono::Local>> {
    chrono::DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Local))
}

/// Local clock span "HH:MM-HH:MM" (end absent -> "HH:MM-??"). None if the start
/// time can't be parsed.
pub fn format_window(f: &SessionFacts) -> Option<String> {
    let start = to_local(&f.start_time)?;
    let start_s = start.format("%H:%M").to_string();
    let end_s = f
        .end_time
        .as_deref()
        .and_then(to_local)
        .map(|e| e.format("%H:%M").to_string())
        .unwrap_or_else(|| "??".to_string());
    Some(format!("{start_s}-{end_s}"))
}

/// Local part-of-day bucket of the session's start. None if start unparseable.
pub fn local_part_of_day(f: &SessionFacts) -> Option<String> {
    use chrono::Timelike;
    let start = to_local(&f.start_time)?;
    Some(part_of_day(start.hour()).to_string())
}

/// Aggregate one day's session facts into a DayChunkInput. Returns None when
/// there were no sessions that day (nothing to roll up). `best_window` is the
/// highest-productivity session's local clock span; `lowest_productivity_label`
/// is the lowest-productivity session's part-of-day (both require ≥2 scored
/// sessions; both `None` when no/insufficient scored sessions exist).
pub fn aggregate_day(
    date: chrono::NaiveDate,
    facts: &[SessionFacts],
) -> Option<DayChunkInput> {
    if facts.is_empty() {
        return None;
    }
    let session_count = facts.len() as i32;
    let total_focus_minutes: i32 = facts.iter().map(|f| f.actual_min.unwrap_or(0)).sum();

    let mut by_app: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    for f in facts {
        for (app, mins) in &f.top_apps {
            *by_app.entry(app.clone()).or_insert(0) += mins;
        }
    }
    let mut top_apps: Vec<(String, i32)> = by_app.into_iter().collect();
    top_apps.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    Some(DayChunkInput {
        date,
        session_count,
        total_focus_minutes,
        best_window: pick_best(facts).and_then(format_window),
        top_apps,
        lowest_productivity_label: pick_lowest(facts).and_then(local_part_of_day),
    })
}

/// Read `date`'s session facts, aggregate, render, and index one ActivityDay
/// chunk. Returns Ok(false) when there were no sessions that day. Idempotent:
/// the chunk id is stable per date.
pub async fn run_day_rollup(
    db: &Db,
    embedder_slot: &OnceLock<Arc<CandleEmbedder>>,
    model_dir: &std::path::Path,
    date: chrono::NaiveDate,
) -> Result<bool, AppError> {
    let date_str = date.to_string();
    let facts = {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        list_session_facts_for_date(&conn, &date_str)?
    };
    let Some(day_input) = aggregate_day(date, &facts) else {
        return Ok(false);
    };

    let embedder = CandleEmbedder::get_or_load(embedder_slot, model_dir)?;
    let text = crate::ai::corpus::render_day_chunk(&day_input);
    let created_at = format!("{date_str}T23:59:59Z");
    index_chunk(
        db,
        embedder.as_ref(),
        ChunkSource::ActivityDay,
        &date_str,
        &created_at,
        text,
    )
    .await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::embedder::MockEmbedder;
    use crate::api::Session;
    use crate::store;
    use crate::store::ai::ModelStatus;
    use crate::tracker::ActivitySample;

    #[test]
    fn should_index_only_when_labs_on_and_ready() {
        assert!(should_index(true, ModelStatus::Ready));
        assert!(!should_index(false, ModelStatus::Ready));
        assert!(!should_index(true, ModelStatus::Downloading));
        assert!(!should_index(true, ModelStatus::NotStarted));
        assert!(!should_index(true, ModelStatus::Error));
    }

    #[test]
    fn should_roll_up_only_when_ready_labs_on_and_not_yet_indexed() {
        assert!(should_roll_up(true, ModelStatus::Ready, false));
        assert!(!should_roll_up(true, ModelStatus::Ready, true)); // already done today
        assert!(!should_roll_up(false, ModelStatus::Ready, false));
        assert!(!should_roll_up(true, ModelStatus::Downloading, false));
    }

    fn open_test_db() -> Db {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    #[test]
    fn stable_id_is_deterministic_and_source_scoped() {
        let a = stable_chunk_id(ChunkSource::Session, "sid-1");
        let b = stable_chunk_id(ChunkSource::Session, "sid-1");
        let c = stable_chunk_id(ChunkSource::ActivityDay, "sid-1");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[tokio::test]
    async fn index_chunk_inserts_one_row() {
        let db = open_test_db();
        let emb = MockEmbedder::default();
        index_chunk(&db, &emb, ChunkSource::Session, "sid-1", "2026-06-23T10:00:00Z", "[Session] text".into())
            .await
            .unwrap();
        let conn = db.lock().unwrap();
        assert_eq!(store_ai::count_chunks(&conn).unwrap(), 1);
    }

    #[tokio::test]
    async fn index_chunk_is_idempotent_for_same_source_ref() {
        let db = open_test_db();
        let emb = MockEmbedder::default();
        for _ in 0..3 {
            index_chunk(&db, &emb, ChunkSource::Session, "sid-1", "2026-06-23T10:00:00Z", "[Session] text".into())
                .await
                .unwrap();
        }
        let conn = db.lock().unwrap();
        assert_eq!(store_ai::count_chunks(&conn).unwrap(), 1, "same source_ref must not duplicate");
    }

    fn sample(app: &str, secs: u64) -> ActivitySample {
        ActivitySample {
            application_name: app.into(),
            process_name: app.into(),
            window_title: "w".into(),
            url: None,
            timestamp: "2026-06-23T09:10:00Z".into(),
            duration_seconds: secs,
        }
    }

    fn sample_session() -> Session {
        Session {
            id: "sid-1".into(),
            user_id: None,
            start_time: "2026-06-23T09:00:00Z".into(),
            end_time: Some("2026-06-23T09:55:00Z".into()),
            planned_duration: 60,
            actual_duration: Some(55),
            session_type: "WORK".into(),
            productivity_score: None,
            completed: true,
            is_paused: false,
            paused_at: None,
            project_id: Some("proj-1".into()),
        }
    }

    #[test]
    fn aggregate_top_apps_sums_and_sorts_desc_in_minutes() {
        let samples = vec![sample("Code", 600), sample("Chrome", 120), sample("Code", 300)];
        let top = aggregate_top_apps(&samples);
        assert_eq!(top[0], ("Code".to_string(), 15)); // 900s -> 15m
        assert_eq!(top[1], ("Chrome".to_string(), 2)); // 120s -> 2m
    }

    #[test]
    fn session_facts_maps_from_chunk_input() {
        let samples = vec![sample("Code", 2400)]; // 40m
        let input = session_chunk_input(&sample_session(), Some(80), &samples);
        let facts = session_facts(&input);

        assert_eq!(facts.session_id, "sid-1");
        assert_eq!(facts.planned_min, 60);
        assert_eq!(facts.actual_min, Some(55));
        assert_eq!(facts.productivity, Some(80));
        assert_eq!(facts.top_apps[0], ("Code".to_string(), 40));
        // date is the LOCAL calendar day of the session's end time.
        assert_eq!(facts.date.len(), 10); // YYYY-MM-DD
        assert!(facts.end_time.is_some());
    }

    #[test]
    fn session_chunk_input_maps_fields_and_parses_times() {
        let samples = vec![sample("Code", 600)];
        let input = session_chunk_input(&sample_session(), Some(80), &samples);
        assert_eq!(input.id, "sid-1");
        assert_eq!(input.planned_duration, 60);
        assert_eq!(input.actual_duration, Some(55));
        assert_eq!(input.productivity_score, Some(80));
        assert_eq!(input.project_name, None); // Session has no project name, only id (1.6a)
        assert_eq!(input.start_time.format("%H:%M").to_string(), "09:00");
        assert_eq!(input.end_time.unwrap().format("%H:%M").to_string(), "09:55");
        assert_eq!(input.top_apps[0], ("Code".to_string(), 10));
    }

    fn facts_row(id: &str, date: &str, actual: i32, top: Vec<(&str, i32)>) -> SessionFacts {
        SessionFacts {
            session_id: id.into(),
            date: date.into(),
            start_time: format!("{date}T09:00:00Z"),
            end_time: Some(format!("{date}T09:55:00Z")),
            planned_min: 60,
            actual_min: Some(actual),
            productivity: Some(70),
            top_apps: top.into_iter().map(|(n, m)| (n.to_string(), m)).collect(),
            created_at: format!("{date}T09:55:00Z"),
        }
    }

    #[test]
    fn aggregate_day_sums_sessions_focus_and_merges_top_apps() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        let facts = vec![
            facts_row("s1", "2026-06-23", 55, vec![("Code", 40), ("Chrome", 15)]),
            facts_row("s2", "2026-06-23", 25, vec![("Code", 20), ("Slack", 5)]),
        ];
        let day = aggregate_day(date, &facts).expect("non-empty day");
        assert_eq!(day.session_count, 2);
        assert_eq!(day.total_focus_minutes, 80); // 55 + 25
        assert_eq!(day.top_apps[0], ("Code".to_string(), 60)); // 40 + 20, merged
    }

    #[test]
    fn aggregate_day_returns_none_for_empty() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        assert!(aggregate_day(date, &[]).is_none());
    }

    fn scored_fact(
        id: &str,
        productivity: Option<i32>,
        actual: Option<i32>,
        start: &str,
        end: Option<&str>,
    ) -> SessionFacts {
        SessionFacts {
            session_id: id.into(),
            date: "2026-06-23".into(),
            start_time: start.into(),
            end_time: end.map(|s| s.into()),
            planned_min: 60,
            actual_min: actual,
            productivity,
            top_apps: vec![("Code".into(), actual.unwrap_or(0))],
            created_at: start.into(),
        }
    }

    #[test]
    fn part_of_day_buckets() {
        assert_eq!(part_of_day(0), "morning");
        assert_eq!(part_of_day(9), "morning");
        assert_eq!(part_of_day(11), "morning");
        assert_eq!(part_of_day(12), "afternoon");
        assert_eq!(part_of_day(16), "afternoon");
        assert_eq!(part_of_day(17), "evening");
        assert_eq!(part_of_day(21), "evening");
    }

    #[test]
    fn pick_best_takes_highest_productivity_then_longer_focus() {
        let facts = vec![
            scored_fact("a", Some(60), Some(40), "2026-06-23T09:00:00+00:00", Some("2026-06-23T09:40:00+00:00")),
            scored_fact("b", Some(90), Some(20), "2026-06-23T11:00:00+00:00", Some("2026-06-23T11:20:00+00:00")),
            scored_fact("c", Some(90), Some(55), "2026-06-23T13:00:00+00:00", Some("2026-06-23T13:55:00+00:00")),
            scored_fact("d", None, Some(99), "2026-06-23T15:00:00+00:00", None),
        ];
        // 'c' and 'b' tie at 90; 'c' wins on larger actual_min (55 > 20).
        assert_eq!(pick_best(&facts).unwrap().session_id, "c");
    }

    #[test]
    fn pick_best_none_when_no_scores() {
        let facts = vec![scored_fact("a", None, Some(40), "2026-06-23T09:00:00+00:00", None)];
        assert!(pick_best(&facts).is_none());
    }

    #[test]
    fn pick_lowest_takes_lowest_and_needs_two_scored() {
        let one = vec![scored_fact("a", Some(30), Some(40), "2026-06-23T09:00:00+00:00", None)];
        assert!(pick_lowest(&one).is_none(), "single scored session has no contrast");

        let many = vec![
            scored_fact("a", Some(80), Some(40), "2026-06-23T09:00:00+00:00", None),
            scored_fact("b", Some(30), Some(25), "2026-06-23T14:00:00+00:00", None),
            scored_fact("c", Some(30), Some(10), "2026-06-23T16:00:00+00:00", None),
            scored_fact("d", None, Some(99), "2026-06-23T18:00:00+00:00", None),
        ];
        // 'b' and 'c' tie at 30; 'c' wins (smaller actual_min 10 < 25).
        assert_eq!(pick_lowest(&many).unwrap().session_id, "c");
    }

    #[test]
    fn format_window_shape_and_missing_end() {
        let with_end = scored_fact("a", Some(80), Some(55), "2026-06-23T09:00:00+00:00", Some("2026-06-23T09:55:00+00:00"));
        let w = format_window(&with_end).unwrap();
        // Local time varies by runner TZ; assert the SHAPE "HH:MM-HH:MM".
        let bytes = w.as_bytes();
        assert_eq!(w.len(), 11, "expected HH:MM-HH:MM, got {w}");
        assert_eq!(bytes[2], b':');
        assert_eq!(bytes[5], b'-');
        assert_eq!(bytes[8], b':');

        let no_end = scored_fact("a", Some(80), Some(55), "2026-06-23T09:00:00+00:00", None);
        assert!(format_window(&no_end).unwrap().ends_with("-??"));

        let bad = scored_fact("a", Some(80), Some(55), "not-a-timestamp", None);
        assert!(format_window(&bad).is_none());
    }

    #[test]
    fn local_part_of_day_none_on_bad_timestamp() {
        let bad = scored_fact("a", Some(80), Some(55), "nonsense", None);
        assert!(local_part_of_day(&bad).is_none());
        // Good timestamp yields one of the three buckets (exact one is TZ-dependent).
        let good = scored_fact("a", Some(80), Some(55), "2026-06-23T09:00:00+00:00", None);
        let label = local_part_of_day(&good).unwrap();
        assert!(["morning", "afternoon", "evening"].contains(&label.as_str()), "got {label}");
    }

    #[test]
    fn aggregate_day_fills_best_window_and_lowest_label() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        let facts = vec![
            scored_fact("a", Some(50), Some(40), "2026-06-23T09:00:00+00:00", Some("2026-06-23T09:40:00+00:00")),
            scored_fact("b", Some(90), Some(55), "2026-06-23T11:00:00+00:00", Some("2026-06-23T11:55:00+00:00")),
            scored_fact("c", Some(20), Some(25), "2026-06-23T14:00:00+00:00", Some("2026-06-23T14:25:00+00:00")),
        ];
        let day = aggregate_day(date, &facts).expect("non-empty");
        // best is 'b' (prod 90) -> a window string of shape HH:MM-HH:MM.
        let bw = day.best_window.expect("best_window set");
        assert_eq!(bw.len(), 11, "expected HH:MM-HH:MM, got {bw}");
        // lowest is 'c' (prod 20) -> a part-of-day bucket.
        let label = day.lowest_productivity_label.expect("lowest label set");
        assert!(["morning", "afternoon", "evening"].contains(&label.as_str()), "got {label}");
    }

    #[test]
    fn aggregate_day_lowest_none_with_one_scored_session() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        let facts = vec![
            scored_fact("a", Some(80), Some(40), "2026-06-23T09:00:00+00:00", Some("2026-06-23T09:40:00+00:00")),
            scored_fact("b", None, Some(30), "2026-06-23T11:00:00+00:00", None),
        ];
        let day = aggregate_day(date, &facts).expect("non-empty");
        assert!(day.best_window.is_some(), "one scored session still yields best_window");
        assert!(day.lowest_productivity_label.is_none(), "needs >=2 scored for a lowest label");
    }
}
