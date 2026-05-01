//! `pending_activity_sync` queue — payloads that failed to POST at
//! session-end, persisted so a background worker can retry later.
//!
//! Bounded at 500 rows / 7-day TTL. On each enqueue we purge rows older
//! than `MAX_AGE_SECS` and, if still over `MAX_ROWS`, drop the oldest by
//! `created_at`. Same invariants the v2 desktop's `PendingOperations`
//! used so users moving between v2 ↔ v3 see consistent behavior.

use super::Db;
use crate::error::{AppError, AppResult};
use crate::tracker::ActivitySample;

const MAX_ROWS: i64 = 500;
const MAX_AGE_SECS: i64 = 7 * 24 * 60 * 60; // 7 days

/// Exponential backoff between retries: `min(5min · 2^retry, 30min)`.
/// Same shape v2 desktop used. Retry counts above 8 saturate at the cap.
pub fn backoff_secs(retry_count: i64) -> i64 {
    let base: i64 = 5 * 60;
    let cap: i64 = 30 * 60;
    let exp = retry_count.clamp(0, 8) as u32;
    base.saturating_mul(2_i64.saturating_pow(exp)).min(cap)
}

#[derive(Debug, Clone)]
pub struct PendingRow {
    pub id: i64,
    pub session_id: String,
    pub samples: Vec<ActivitySample>,
    pub retry_count: i64,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn lock(db: &Db) -> AppResult<std::sync::MutexGuard<'_, rusqlite::Connection>> {
    db.lock()
        .map_err(|_| AppError::Storage("db mutex poisoned".into()))
}

/// Persist a failed sync payload for later retry.
pub fn enqueue(db: &Db, session_id: &str, samples: &[ActivitySample]) -> AppResult<()> {
    let payload = serde_json::to_string(samples)?;
    let now = now_secs();
    let conn = lock(db)?;
    conn.execute(
        "INSERT INTO pending_activity_sync\n\
         (session_id, payload, retry_count, created_at, next_retry_at)\n\
         VALUES (?1, ?2, 0, ?3, ?3)",
        rusqlite::params![session_id, payload, now],
    )
    .map_err(|e| AppError::Storage(format!("enqueue: {e}")))?;
    purge_locked(&conn, now)?;
    Ok(())
}

/// Fetch up to `limit` rows whose `next_retry_at <= now`, oldest first.
pub fn ready_rows(db: &Db, limit: i64) -> AppResult<Vec<PendingRow>> {
    let now = now_secs();
    let conn = lock(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, payload, retry_count\n\
             FROM pending_activity_sync\n\
             WHERE next_retry_at <= ?1\n\
             ORDER BY created_at ASC\n\
             LIMIT ?2",
        )
        .map_err(|e| AppError::Storage(format!("ready_rows prepare: {e}")))?;
    let rows = stmt
        .query_map(rusqlite::params![now, limit], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })
        .map_err(|e| AppError::Storage(format!("ready_rows query: {e}")))?;
    let mut out = Vec::new();
    for r in rows {
        let (id, session_id, payload, retry_count) =
            r.map_err(|e| AppError::Storage(format!("ready_rows row: {e}")))?;
        let samples: Vec<ActivitySample> = serde_json::from_str(&payload)?;
        out.push(PendingRow {
            id,
            session_id,
            samples,
            retry_count,
        });
    }
    Ok(out)
}

pub fn delete(db: &Db, id: i64) -> AppResult<()> {
    let conn = lock(db)?;
    conn.execute(
        "DELETE FROM pending_activity_sync WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| AppError::Storage(format!("delete: {e}")))?;
    Ok(())
}

/// Bump retry count + schedule next attempt via `backoff_secs(retry+1)`.
pub fn record_failure(db: &Db, id: i64, retry_count: i64) -> AppResult<()> {
    let next = now_secs() + backoff_secs(retry_count + 1);
    let conn = lock(db)?;
    conn.execute(
        "UPDATE pending_activity_sync\n\
         SET retry_count = ?1, next_retry_at = ?2\n\
         WHERE id = ?3",
        rusqlite::params![retry_count + 1, next, id],
    )
    .map_err(|e| AppError::Storage(format!("record_failure: {e}")))?;
    Ok(())
}

/// Drop rows older than `MAX_AGE_SECS`, then if still over `MAX_ROWS`,
/// drop the oldest until we're under the cap. Called on each enqueue.
fn purge_locked(conn: &rusqlite::Connection, now: i64) -> AppResult<()> {
    conn.execute(
        "DELETE FROM pending_activity_sync WHERE created_at < ?1",
        rusqlite::params![now - MAX_AGE_SECS],
    )
    .map_err(|e| AppError::Storage(format!("purge ttl: {e}")))?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM pending_activity_sync", [], |r| r.get(0))
        .map_err(|e| AppError::Storage(format!("purge count: {e}")))?;
    if count > MAX_ROWS {
        let excess = count - MAX_ROWS;
        conn.execute(
            "DELETE FROM pending_activity_sync WHERE id IN (\n\
                SELECT id FROM pending_activity_sync\n\
                ORDER BY created_at ASC LIMIT ?1\n\
             )",
            rusqlite::params![excess],
        )
        .map_err(|e| AppError::Storage(format!("purge cap: {e}")))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_caps_at_30min() {
        assert_eq!(backoff_secs(0), 5 * 60);
        assert_eq!(backoff_secs(1), 10 * 60);
        assert_eq!(backoff_secs(2), 20 * 60);
        assert_eq!(backoff_secs(3), 30 * 60);
        assert_eq!(backoff_secs(8), 30 * 60);
        assert_eq!(backoff_secs(99), 30 * 60);
    }
}
