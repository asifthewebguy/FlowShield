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
}
