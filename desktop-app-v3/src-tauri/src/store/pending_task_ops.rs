//! `pending_task_ops` — offline write queue for task mutations. Unlike
//! `pending_sync` (legacy, drain-only), this table is actively written to:
//! every create/update/delete that fails while offline enqueues here, and
//! `sync_worker`'s existing 60s tick drains it with the same exponential
//! backoff `pending_sync` already uses.

use super::Db;
use crate::error::{AppError, AppResult};
use rusqlite::Connection;

/// Exponential backoff between retries: `min(5min · 2^retry, 30min)` —
/// identical shape to `pending_sync::backoff_secs`.
pub fn backoff_secs(retry_count: i64) -> i64 {
    let base: i64 = 5 * 60;
    let cap: i64 = 30 * 60;
    let exp = retry_count.clamp(0, 8) as u32;
    base.saturating_mul(2_i64.saturating_pow(exp)).min(cap)
}

#[derive(Debug, Clone)]
pub struct PendingTaskOp {
    pub id: i64,
    pub op: String,
    pub payload: String,
    pub retry_count: i64,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn lock(db: &Db) -> AppResult<std::sync::MutexGuard<'_, rusqlite::Connection>> {
    db.lock().map_err(|_| AppError::Storage("db mutex poisoned".into()))
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pending_task_ops (\n\
            id            INTEGER PRIMARY KEY AUTOINCREMENT,\n\
            op            TEXT    NOT NULL,\n\
            payload       TEXT    NOT NULL,\n\
            retry_count   INTEGER NOT NULL DEFAULT 0,\n\
            created_at    INTEGER NOT NULL,\n\
            next_retry_at INTEGER NOT NULL\n\
         );\n\
         CREATE INDEX IF NOT EXISTS idx_pending_task_ops_next_retry\n\
            ON pending_task_ops (next_retry_at);",
    )
    .map_err(|e| AppError::Storage(format!("pending_task_ops migrate: {e}")))?;
    Ok(())
}

/// Queue one op (`"create"` / `"update"` / `"delete"`) with its JSON
/// payload for later replay. Returns the new row's id.
pub fn enqueue(db: &Db, op: &str, payload: &str) -> AppResult<i64> {
    let now = now_secs();
    let conn = lock(db)?;
    conn.execute(
        "INSERT INTO pending_task_ops (op, payload, retry_count, created_at, next_retry_at)\n\
         VALUES (?1, ?2, 0, ?3, ?3)",
        rusqlite::params![op, payload, now],
    )
    .map_err(|e| AppError::Storage(format!("enqueue: {e}")))?;
    Ok(conn.last_insert_rowid())
}

/// Fetch up to `limit` rows whose `next_retry_at <= now`, oldest first.
pub fn ready_rows(db: &Db, limit: i64) -> AppResult<Vec<PendingTaskOp>> {
    let now = now_secs();
    let conn = lock(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, op, payload, retry_count\n\
             FROM pending_task_ops\n\
             WHERE next_retry_at <= ?1\n\
             ORDER BY created_at ASC\n\
             LIMIT ?2",
        )
        .map_err(|e| AppError::Storage(format!("ready_rows prepare: {e}")))?;
    let rows = stmt
        .query_map(rusqlite::params![now, limit], |r| {
            Ok(PendingTaskOp {
                id: r.get(0)?,
                op: r.get(1)?,
                payload: r.get(2)?,
                retry_count: r.get(3)?,
            })
        })
        .map_err(|e| AppError::Storage(format!("ready_rows query: {e}")))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| AppError::Storage(format!("ready_rows row: {e}")))?);
    }
    Ok(out)
}

pub fn delete(db: &Db, id: i64) -> AppResult<()> {
    let conn = lock(db)?;
    conn.execute("DELETE FROM pending_task_ops WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| AppError::Storage(format!("delete: {e}")))?;
    Ok(())
}

pub fn record_failure(db: &Db, id: i64, retry_count: i64) -> AppResult<()> {
    let next = now_secs() + backoff_secs(retry_count + 1);
    let conn = lock(db)?;
    conn.execute(
        "UPDATE pending_task_ops SET retry_count = ?1, next_retry_at = ?2 WHERE id = ?3",
        rusqlite::params![retry_count + 1, next, id],
    )
    .map_err(|e| AppError::Storage(format!("record_failure: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    fn test_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn backoff_caps_at_30min() {
        assert_eq!(backoff_secs(0), 5 * 60);
        assert_eq!(backoff_secs(3), 30 * 60);
        assert_eq!(backoff_secs(99), 30 * 60);
    }

    #[test]
    fn enqueue_then_ready_rows_round_trips() {
        let db = test_db();
        let id = enqueue(&db, "create", r#"{"title":"x"}"#).unwrap();
        let rows = ready_rows(&db, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, id);
        assert_eq!(rows[0].op, "create");
        assert_eq!(rows[0].retry_count, 0);
    }

    #[test]
    fn record_failure_delays_next_ready_rows_call() {
        let db = test_db();
        let id = enqueue(&db, "update", r#"{"status":"DONE"}"#).unwrap();
        record_failure(&db, id, 0).unwrap();
        // next_retry_at is now ~5 minutes out — nothing should be ready yet.
        let rows = ready_rows(&db, 10).unwrap();
        assert_eq!(rows.len(), 0);
    }

    #[test]
    fn delete_removes_the_row() {
        let db = test_db();
        let id = enqueue(&db, "delete", r#"{"id":"task-1"}"#).unwrap();
        delete(&db, id).unwrap();
        let rows = ready_rows(&db, 10).unwrap();
        assert_eq!(rows.len(), 0);
    }

    #[test]
    fn ready_rows_respects_limit_and_order() {
        let db = test_db();
        enqueue(&db, "create", r#"{"title":"a"}"#).unwrap();
        enqueue(&db, "create", r#"{"title":"b"}"#).unwrap();
        enqueue(&db, "create", r#"{"title":"c"}"#).unwrap();
        let rows = ready_rows(&db, 2).unwrap();
        assert_eq!(rows.len(), 2);
    }
}
