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
}
