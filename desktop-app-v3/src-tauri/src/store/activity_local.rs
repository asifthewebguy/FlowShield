//! Locally persisted activity buckets. The always-on tracker writes one
//! row per foreground-window bucket as it opens (`closed = 0`), checkpoints
//! its duration every 30 s, and finalises it (`closed = 1`) on window
//! change / idle / pause / flush. The upload job ships `closed = 1 AND
//! synced = 0` rows to `/api/activity/sync` and flips `synced`.
//!
//! Retention: rows older than `activity_upload::RETENTION_SECS` are purged
//! on each upload tick regardless of sync state, bounding the file.

use super::Db;
use crate::error::{AppError, AppResult};
use crate::tracker::ActivitySample;
use rusqlite::{params, Connection};

pub struct LocalRow {
    pub id: i64,
    pub sample: ActivitySample,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn lock(db: &Db) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
    db.lock()
        .map_err(|_| AppError::Storage("db mutex poisoned".into()))
}

fn storage<E: std::fmt::Display>(what: &str) -> impl FnOnce(E) -> AppError + '_ {
    move |e| AppError::Storage(format!("activity_local {what}: {e}"))
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS activity_local (\n\
            id               INTEGER PRIMARY KEY AUTOINCREMENT,\n\
            session_id       TEXT,\n\
            application_name TEXT    NOT NULL,\n\
            process_name     TEXT    NOT NULL,\n\
            window_title     TEXT    NOT NULL,\n\
            url              TEXT,\n\
            timestamp        TEXT    NOT NULL,\n\
            duration_seconds INTEGER NOT NULL,\n\
            closed           INTEGER NOT NULL DEFAULT 0,\n\
            synced           INTEGER NOT NULL DEFAULT 0,\n\
            created_at       INTEGER NOT NULL\n\
         );\n\
         CREATE INDEX IF NOT EXISTS idx_activity_local_upload\n\
            ON activity_local (synced, closed, id);\n\
         CREATE INDEX IF NOT EXISTS idx_activity_local_created\n\
            ON activity_local (created_at);",
    )
    .map_err(storage("migrate"))
}

pub fn insert_open(db: &Db, s: &ActivitySample) -> AppResult<i64> {
    let conn = lock(db)?;
    conn.execute(
        "INSERT INTO activity_local\n\
         (session_id, application_name, process_name, window_title, url,\n\
          timestamp, duration_seconds, closed, synced, created_at)\n\
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8)",
        params![
            s.session_id,
            s.application_name,
            s.process_name,
            s.window_title,
            s.url,
            s.timestamp,
            s.duration_seconds as i64,
            now_secs(),
        ],
    )
    .map_err(storage("insert_open"))?;
    Ok(conn.last_insert_rowid())
}

pub fn update_duration(db: &Db, id: i64, duration_seconds: u64) -> AppResult<()> {
    let conn = lock(db)?;
    conn.execute(
        "UPDATE activity_local SET duration_seconds = ?1 WHERE id = ?2",
        params![duration_seconds as i64, id],
    )
    .map_err(storage("update_duration"))?;
    Ok(())
}

pub fn close(db: &Db, id: i64, duration_seconds: u64) -> AppResult<()> {
    let conn = lock(db)?;
    conn.execute(
        "UPDATE activity_local SET duration_seconds = ?1, closed = 1 WHERE id = ?2",
        params![duration_seconds as i64, id],
    )
    .map_err(storage("close"))?;
    Ok(())
}

/// Finalise buckets left open by a previous run (crash, kill, power loss).
/// Their checkpointed duration is the best information we have.
pub fn close_all_open(db: &Db) -> AppResult<usize> {
    let conn = lock(db)?;
    conn.execute("UPDATE activity_local SET closed = 1 WHERE closed = 0", [])
        .map_err(storage("close_all_open"))
}

pub fn closed_unsynced(db: &Db, limit: i64) -> AppResult<Vec<LocalRow>> {
    let conn = lock(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, application_name, process_name, window_title, url,\n\
                    timestamp, duration_seconds\n\
             FROM activity_local\n\
             WHERE closed = 1 AND synced = 0\n\
             ORDER BY id ASC\n\
             LIMIT ?1",
        )
        .map_err(storage("closed_unsynced prepare"))?;
    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(LocalRow {
                id: r.get(0)?,
                sample: ActivitySample {
                    session_id: r.get(1)?,
                    application_name: r.get(2)?,
                    process_name: r.get(3)?,
                    window_title: r.get(4)?,
                    url: r.get(5)?,
                    timestamp: r.get(6)?,
                    duration_seconds: r.get::<_, i64>(7)?.max(0) as u64,
                },
            })
        })
        .map_err(storage("closed_unsynced query"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(storage("closed_unsynced row"))?);
    }
    Ok(out)
}

/// All closed buckets recorded during one focus session, oldest first.
/// Unlike `closed_unsynced` this ignores sync state — callers (the AI
/// indexer) need the session's full timeline whether or not it uploaded.
pub fn rows_for_session(db: &Db, session_id: &str) -> AppResult<Vec<LocalRow>> {
    let conn = lock(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, application_name, process_name, window_title, url,\n\
                    timestamp, duration_seconds\n\
             FROM activity_local\n\
             WHERE session_id = ?1 AND closed = 1\n\
             ORDER BY id ASC",
        )
        .map_err(storage("rows_for_session prepare"))?;
    let rows = stmt
        .query_map(params![session_id], |r| {
            Ok(LocalRow {
                id: r.get(0)?,
                sample: ActivitySample {
                    session_id: r.get(1)?,
                    application_name: r.get(2)?,
                    process_name: r.get(3)?,
                    window_title: r.get(4)?,
                    url: r.get(5)?,
                    timestamp: r.get(6)?,
                    duration_seconds: r.get::<_, i64>(7)?.max(0) as u64,
                },
            })
        })
        .map_err(storage("rows_for_session query"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(storage("rows_for_session row"))?);
    }
    Ok(out)
}

pub fn mark_synced(db: &Db, ids: &[i64]) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut conn = lock(db)?;
    let tx = conn.transaction().map_err(storage("mark_synced tx"))?;
    for id in ids {
        tx.execute(
            "UPDATE activity_local SET synced = 1 WHERE id = ?1",
            params![id],
        )
        .map_err(storage("mark_synced"))?;
    }
    tx.commit().map_err(storage("mark_synced commit"))
}

pub fn purge_older_than(db: &Db, max_age_secs: i64) -> AppResult<usize> {
    let conn = lock(db)?;
    conn.execute(
        "DELETE FROM activity_local WHERE created_at < ?1",
        params![now_secs() - max_age_secs],
    )
    .map_err(storage("purge"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn test_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        crate::store::apply_migrations(&conn).unwrap();
        Arc::new(Mutex::new(conn))
    }

    fn sample(app: &str, session: Option<&str>) -> ActivitySample {
        ActivitySample {
            application_name: app.into(),
            process_name: format!("{app}.bin"),
            window_title: "title".into(),
            url: None,
            timestamp: "2026-09-03T10:00:00.000Z".into(),
            duration_seconds: 1,
            session_id: session.map(str::to_string),
        }
    }

    #[test]
    fn open_rows_are_not_uploadable_until_closed() {
        let db = test_db();
        let id = insert_open(&db, &sample("Code", Some("s1"))).unwrap();
        assert!(closed_unsynced(&db, 10).unwrap().is_empty());
        update_duration(&db, id, 30).unwrap();
        assert!(closed_unsynced(&db, 10).unwrap().is_empty());
        close(&db, id, 42).unwrap();
        let rows = closed_unsynced(&db, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, id);
        assert_eq!(rows[0].sample.duration_seconds, 42);
        assert_eq!(rows[0].sample.session_id.as_deref(), Some("s1"));
        assert_eq!(rows[0].sample.application_name, "Code");
    }

    #[test]
    fn rows_for_session_returns_only_that_sessions_closed_rows() {
        let db = test_db();
        let a = insert_open(&db, &sample("Code", Some("s1"))).unwrap();
        let b = insert_open(&db, &sample("Firefox", Some("s1"))).unwrap();
        let other = insert_open(&db, &sample("Slack", None)).unwrap();
        close(&db, a, 10).unwrap();
        close(&db, b, 20).unwrap();
        close(&db, other, 5).unwrap();

        let rows = rows_for_session(&db, "s1").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, a);
        assert_eq!(rows[1].id, b);
        assert!(rows.iter().all(|r| r.sample.session_id.as_deref() == Some("s1")));
        assert!(rows.iter().all(|r| r.id != other));
    }

    #[test]
    fn mark_synced_removes_from_upload_set() {
        let db = test_db();
        let a = insert_open(&db, &sample("A", None)).unwrap();
        let b = insert_open(&db, &sample("B", None)).unwrap();
        close(&db, a, 5).unwrap();
        close(&db, b, 6).unwrap();
        mark_synced(&db, &[a]).unwrap();
        let rows = closed_unsynced(&db, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, b);
    }

    #[test]
    fn closed_unsynced_respects_limit_and_order() {
        let db = test_db();
        for i in 0..5 {
            let id = insert_open(&db, &sample(&format!("app{i}"), None)).unwrap();
            close(&db, id, 1).unwrap();
        }
        let rows = closed_unsynced(&db, 3).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].sample.application_name, "app0");
        assert_eq!(rows[2].sample.application_name, "app2");
    }

    #[test]
    fn close_all_open_finalises_orphans() {
        let db = test_db();
        insert_open(&db, &sample("A", None)).unwrap();
        insert_open(&db, &sample("B", None)).unwrap();
        let closed_now = close_all_open(&db).unwrap();
        assert_eq!(closed_now, 2);
        assert_eq!(closed_unsynced(&db, 10).unwrap().len(), 2);
        assert_eq!(close_all_open(&db).unwrap(), 0);
    }

    #[test]
    fn purge_removes_only_old_rows() {
        let db = test_db();
        let old = insert_open(&db, &sample("old", None)).unwrap();
        close(&db, old, 1).unwrap();
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "UPDATE activity_local SET created_at = created_at - 200 WHERE id = ?1",
                rusqlite::params![old],
            )
            .unwrap();
        }
        let fresh = insert_open(&db, &sample("fresh", None)).unwrap();
        close(&db, fresh, 1).unwrap();
        assert_eq!(purge_older_than(&db, 100).unwrap(), 1);
        let rows = closed_unsynced(&db, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].sample.application_name, "fresh");
    }
}
