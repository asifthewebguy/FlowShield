//! Shared corpus indexing: embed chunk text and upsert it as one ai_chunks
//! row. Idempotent via a deterministic id derived from (source, source_ref).

use crate::ai::candle_embedder::CandleEmbedder;
use crate::ai::corpus::SessionChunkInput;
use crate::ai::embedder::Embedder;
use crate::api::Session;
use crate::error::AppError;
use crate::store::ai::{self as store_ai, Chunk, ChunkSource, ModelStatus};
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
}
