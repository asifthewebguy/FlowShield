//! Local persistent store backing offline features. Phase 4 introduces
//! this as a tiny SQLite database living under the OS-conventional app-data
//! directory (`~/.local/share/FlowShield/local.sqlite` on Linux, equivalent
//! on macOS/Windows).
//!
//! The only resident today is `pending_activity_sync` — payloads from
//! `/api/activity/sync` requests that failed at session-end so a background
//! worker can retry them later. A future phase can bolt on more tables
//! (cached preferences, blocked-domains list, …) without moving the file.
//!
//! Threading: rusqlite's `Connection` is `!Sync`, so a single
//! `Arc<Mutex<Connection>>` is shared and every operation locks. Lock
//! durations are microseconds (one statement at a time) — sufficient until
//! we have a reason to switch to a connection pool.

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub mod activity_local;
pub mod ai;
pub mod pending_sync;
pub mod pending_task_ops;

pub type Db = Arc<Mutex<Connection>>;

/// Open the local SQLite database, creating + migrating the schema if
/// needed. The parent directory is created on first launch.
pub fn open(path: &Path) -> AppResult<Db> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Storage(format!("create db dir: {e}")))?;
    }
    let conn =
        Connection::open(path).map_err(|e| AppError::Storage(format!("open db: {e}")))?;
    // WAL gives us crash-safe writes and concurrent readers; NORMAL
    // synchronous trades the last few writes' durability on a hard kill
    // for ~10x write throughput — acceptable since the source data
    // (in-memory tracker buffer) is already gone in that scenario.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;\n\
         PRAGMA synchronous = NORMAL;\n\
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| AppError::Storage(format!("pragma: {e}")))?;
    apply_migrations(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

pub(crate) fn apply_migrations(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pending_activity_sync (\n\
            id            INTEGER PRIMARY KEY AUTOINCREMENT,\n\
            session_id    TEXT    NOT NULL,\n\
            payload       TEXT    NOT NULL,\n\
            retry_count   INTEGER NOT NULL DEFAULT 0,\n\
            created_at    INTEGER NOT NULL,\n\
            next_retry_at INTEGER NOT NULL\n\
         );\n\
         CREATE INDEX IF NOT EXISTS idx_pending_activity_next_retry\n\
            ON pending_activity_sync (next_retry_at);",
    )
    .map_err(|e| AppError::Storage(format!("migrate: {e}")))?;
    ai::migrate(conn)?;
    activity_local::migrate(conn)?;
    pending_task_ops::migrate(conn)?;
    Ok(())
}
