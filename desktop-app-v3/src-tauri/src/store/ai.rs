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
            source      TEXT NOT NULL,
            source_ref  TEXT NOT NULL,
            text        TEXT NOT NULL,
            embedding   BLOB NOT NULL,
            created_at  TEXT NOT NULL,
            embedded_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_chunks_source     ON ai_chunks(source, source_ref);
        CREATE INDEX IF NOT EXISTS idx_ai_chunks_created_at ON ai_chunks(created_at);

        CREATE TABLE IF NOT EXISTS ai_reflections (
            id         TEXT PRIMARY KEY,
            date       TEXT NOT NULL UNIQUE,
            questions  TEXT NOT NULL,
            answer     TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_briefings (
            date         TEXT PRIMARY KEY,
            text         TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            model_id     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_model_state (
            id              INTEGER PRIMARY KEY CHECK (id = 1),
            model_id        TEXT NOT NULL,
            model_path      TEXT NOT NULL,
            model_sha256    TEXT NOT NULL,
            embedder_id     TEXT NOT NULL,
            embedder_path   TEXT NOT NULL,
            embedder_sha256 TEXT NOT NULL,
            downloaded_at   TEXT,
            status          TEXT NOT NULL
        );
        "#,
    )
    .map_err(|e| AppError::Storage(format!("ai migrate: {e}")))?;
    Ok(())
}

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
    pub created_at: String,
    pub embedded_at: String,
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
    )
    .map_err(|e| AppError::Storage(format!("insert_chunk: {e}")))?;
    Ok(())
}

pub fn list_chunks_since(conn: &Connection, since_rfc3339: &str) -> Result<Vec<Chunk>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, source, source_ref, text, embedding, created_at, embedded_at
             FROM ai_chunks
             WHERE created_at >= ?
             ORDER BY created_at DESC",
        )
        .map_err(|e| AppError::Storage(format!("list_chunks_since prepare: {e}")))?;
    let rows = stmt
        .query_map(params![since_rfc3339], |r| {
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
        })
        .map_err(|e| AppError::Storage(format!("list_chunks_since query: {e}")))?;
    Ok(rows.filter_map(Result::ok).collect())
}

pub fn delete_all_chunks(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_chunks", [])
        .map_err(|e| AppError::Storage(format!("delete_all_chunks: {e}")))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reflection {
    pub id: String,
    pub date: String,
    pub questions: Vec<String>,
    pub answer: String,
    pub created_at: String,
}

pub fn upsert_reflection(conn: &Connection, r: &Reflection) -> Result<(), AppError> {
    let questions_json = serde_json::to_string(&r.questions)
        .map_err(|e| AppError::Storage(format!("reflection questions JSON: {e}")))?;
    conn.execute(
        "INSERT INTO ai_reflections (id, date, questions, answer, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
             questions  = excluded.questions,
             answer     = excluded.answer,
             created_at = excluded.created_at",
        params![r.id, r.date, questions_json, r.answer, r.created_at],
    )
    .map_err(|e| AppError::Storage(format!("upsert_reflection: {e}")))?;
    Ok(())
}

pub fn get_reflection_by_date(
    conn: &Connection,
    date: &str,
) -> Result<Option<Reflection>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, date, questions, answer, created_at
             FROM ai_reflections
             WHERE date = ?",
        )
        .map_err(|e| AppError::Storage(format!("get_reflection_by_date prepare: {e}")))?;
    let mut rows = stmt
        .query(params![date])
        .map_err(|e| AppError::Storage(format!("get_reflection_by_date query: {e}")))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| AppError::Storage(format!("get_reflection_by_date row: {e}")))?
    {
        let questions_str: String = row.get(2).map_err(|e| AppError::Storage(format!("{e}")))?;
        let questions: Vec<String> = serde_json::from_str(&questions_str)
            .map_err(|e| AppError::Storage(format!("reflection questions parse: {e}")))?;
        Ok(Some(Reflection {
            id: row.get(0).map_err(|e| AppError::Storage(format!("{e}")))?,
            date: row.get(1).map_err(|e| AppError::Storage(format!("{e}")))?,
            questions,
            answer: row.get(3).map_err(|e| AppError::Storage(format!("{e}")))?,
            created_at: row.get(4).map_err(|e| AppError::Storage(format!("{e}")))?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_all_reflections(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_reflections", [])
        .map_err(|e| AppError::Storage(format!("delete_all_reflections: {e}")))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Briefing {
    pub date: String,
    pub text: String,
    pub generated_at: String,
    pub model_id: String,
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
    )
    .map_err(|e| AppError::Storage(format!("upsert_briefing: {e}")))?;
    Ok(())
}

pub fn get_briefing_for(
    conn: &Connection,
    date: &str,
    current_model_id: &str,
) -> Result<Option<Briefing>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT date, text, generated_at, model_id
             FROM ai_briefings
             WHERE date = ? AND model_id = ?",
        )
        .map_err(|e| AppError::Storage(format!("get_briefing_for prepare: {e}")))?;
    let mut rows = stmt
        .query(params![date, current_model_id])
        .map_err(|e| AppError::Storage(format!("get_briefing_for query: {e}")))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| AppError::Storage(format!("get_briefing_for row: {e}")))?
    {
        Ok(Some(Briefing {
            date: row.get(0).map_err(|e| AppError::Storage(format!("{e}")))?,
            text: row.get(1).map_err(|e| AppError::Storage(format!("{e}")))?,
            generated_at: row.get(2).map_err(|e| AppError::Storage(format!("{e}")))?,
            model_id: row.get(3).map_err(|e| AppError::Storage(format!("{e}")))?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_all_briefings(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_briefings", [])
        .map_err(|e| AppError::Storage(format!("delete_all_briefings: {e}")))?;
    Ok(())
}

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
    pub downloaded_at: Option<String>,
    pub status: ModelStatus,
}

pub fn get_model_state(conn: &Connection) -> Result<Option<ModelState>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT model_id, model_path, model_sha256, embedder_id, embedder_path,
                    embedder_sha256, downloaded_at, status
             FROM ai_model_state
             WHERE id = 1",
        )
        .map_err(|e| AppError::Storage(format!("get_model_state prepare: {e}")))?;
    let mut rows = stmt
        .query([])
        .map_err(|e| AppError::Storage(format!("get_model_state query: {e}")))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| AppError::Storage(format!("get_model_state row: {e}")))?
    {
        let status_str: String = row.get(7).map_err(|e| AppError::Storage(format!("{e}")))?;
        Ok(Some(ModelState {
            model_id: row.get(0).map_err(|e| AppError::Storage(format!("{e}")))?,
            model_path: row.get(1).map_err(|e| AppError::Storage(format!("{e}")))?,
            model_sha256: row.get(2).map_err(|e| AppError::Storage(format!("{e}")))?,
            embedder_id: row.get(3).map_err(|e| AppError::Storage(format!("{e}")))?,
            embedder_path: row.get(4).map_err(|e| AppError::Storage(format!("{e}")))?,
            embedder_sha256: row.get(5).map_err(|e| AppError::Storage(format!("{e}")))?,
            downloaded_at: row.get(6).map_err(|e| AppError::Storage(format!("{e}")))?,
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
    )
    .map_err(|e| AppError::Storage(format!("upsert_model_state: {e}")))?;
    Ok(())
}

pub fn delete_model_state(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_model_state", [])
        .map_err(|e| AppError::Storage(format!("delete_model_state: {e}")))?;
    Ok(())
}

pub fn count_chunks(conn: &Connection) -> Result<i64, AppError> {
    conn.query_row("SELECT COUNT(*) FROM ai_chunks", [], |r| r.get(0))
        .map_err(|e| AppError::Storage(format!("count_chunks: {e}")))
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
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();
    }

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

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM ai_reflections", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1, "should not duplicate rows on upsert");
    }

    #[test]
    fn get_reflection_returns_none_when_missing() {
        let conn = fresh_conn();
        let got = get_reflection_by_date(&conn, "2026-05-05").unwrap();
        assert!(got.is_none());
    }

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

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM ai_briefings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

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
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM ai_model_state", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let got = get_model_state(&conn).unwrap().unwrap();
        assert_eq!(got.status, ModelStatus::Ready);
    }
}
