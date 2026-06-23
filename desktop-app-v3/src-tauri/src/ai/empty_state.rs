//! Whether the user has enough recent activity for a useful briefing.
//! The empty-state UI gates on `session_chunk_count_last_7d` vs
//! `MIN_SESSION_CHUNKS_LAST_7D` — a briefing built from < 5 sessions
//! reads generic and erodes trust.

use crate::store::Db;

/// Threshold matching the parent design's "complete a few more focus
/// sessions to unlock your AI briefing" copy. ≥5 session chunks in
/// the last 7 days. Each completed focus session produces one chunk
/// (source = 'session') during the nightly indexing pass.
pub const MIN_SESSION_CHUNKS_LAST_7D: i64 = 5;

/// Count of `source='session'` chunks in `ai_chunks` from the last 7 days —
/// the input to the empty-state progress counter.
/// Fails closed to 0 on a poisoned mutex or any DB error.
pub fn session_chunk_count_last_7d(db: &Db) -> i64 {
    let conn = match db.lock() {
        Ok(g) => g,
        Err(_) => return 0, // poisoned mutex → fail closed
    };
    conn.query_row(
        "SELECT COUNT(*) FROM ai_chunks \
         WHERE source = 'session' \
           AND created_at >= datetime('now', '-7 days')",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store;
    use rusqlite::params;
    use tempfile::tempdir;

    fn open_test_db() -> Db {
        let tmp = tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    /// Insert a fake session chunk directly into ai_chunks.
    /// `created_at` is an ISO8601 datetime string e.g. "2026-05-07 09:00:00".
    fn insert_session_chunk(db: &Db, created_at: &str) {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO ai_chunks \
             (id, source, source_ref, text, embedding, created_at, embedded_at) \
             VALUES (?, 'session', 'ref', 'chunk text', zeroblob(1536), ?, ?)",
            params![chunk_id(), created_at, created_at],
        )
        .expect("insert session chunk");
    }

    fn chunk_id() -> String {
        format!(
            "test-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        )
    }

    #[test]
    fn count_is_zero_when_no_chunks() {
        let db = open_test_db();
        assert_eq!(session_chunk_count_last_7d(&db), 0);
    }

    #[test]
    fn count_matches_recent_session_chunks() {
        let db = open_test_db();
        let now = chrono::Utc::now();
        for i in 0..4i64 {
            let dt = now - chrono::Duration::days(i);
            insert_session_chunk(&db, &dt.format("%Y-%m-%d %H:%M:%S").to_string());
        }
        assert_eq!(session_chunk_count_last_7d(&db), 4);
    }

    #[test]
    fn count_excludes_old_and_non_session_chunks() {
        let db = open_test_db();
        // Old session chunk (outside the 7-day window).
        insert_session_chunk(&db, "2025-01-01 09:00:00");
        // Recent non-session chunk (activity_day) — must not be counted.
        {
            let conn = db.lock().unwrap();
            let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            conn.execute(
                "INSERT INTO ai_chunks \
                 (id, source, source_ref, text, embedding, created_at, embedded_at) \
                 VALUES (?, 'activity_day', 'ref', 'day', zeroblob(1536), ?, ?)",
                params![format!("act-{now}"), now, now],
            )
            .unwrap();
        }
        assert_eq!(session_chunk_count_last_7d(&db), 0);
    }
}
