//! Whether the user has enough recent activity for a useful briefing.
//! Both the 5am scheduler and the lazy `ai_briefing_today` fallback gate
//! on this — a briefing built from < 5 sessions reads generic and erodes
//! trust.

use crate::store::Db;

/// Threshold matching the parent design's "complete a few more focus
/// sessions to unlock your AI briefing" copy. ≥5 session chunks in
/// the last 7 days. Each completed focus session produces one chunk
/// (source = 'session') during the nightly indexing pass.
const MIN_SESSION_CHUNKS_LAST_7D: i64 = 5;

/// Returns true when ≥5 session chunks exist in `ai_chunks` from the
/// last 7 days. Uses the existing `ai_chunks` table (source = 'session')
/// because the desktop-v3 store has no standalone `sessions` table —
/// the corpus indexer is the authoritative record of completed sessions.
///
/// Fails closed: returns false on a poisoned mutex or any DB error.
pub fn has_minimum_data(db: &Db) -> bool {
    let conn = match db.lock() {
        Ok(g) => g,
        Err(_) => return false, // poisoned mutex → fail closed
    };
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM ai_chunks \
             WHERE source = 'session' \
               AND created_at >= datetime('now', '-7 days')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    count >= MIN_SESSION_CHUNKS_LAST_7D
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
    fn has_minimum_data_returns_false_below_threshold() {
        let db = open_test_db();
        // 4 recent completed sessions — one short of the ≥5 threshold
        for i in 1..=4u32 {
            insert_session_chunk(&db, &format!("2026-05-0{i} 09:00:00"));
        }
        assert!(!has_minimum_data(&db));
    }

    #[test]
    fn has_minimum_data_returns_true_at_threshold() {
        let db = open_test_db();
        let now = chrono::Utc::now();
        for i in 0..5i64 {
            let dt = now - chrono::Duration::days(i);
            insert_session_chunk(&db, &dt.format("%Y-%m-%d %H:%M:%S").to_string());
        }
        assert!(has_minimum_data(&db));
    }

    #[test]
    fn has_minimum_data_excludes_old_sessions() {
        let db = open_test_db();
        // 5 sessions from 2025 — outside the 7-day window
        for i in 1..=5u32 {
            insert_session_chunk(&db, &format!("2025-01-0{i} 09:00:00"));
        }
        assert!(!has_minimum_data(&db));
    }

    #[test]
    fn has_minimum_data_excludes_non_session_chunks() {
        let db = open_test_db();
        let now = chrono::Utc::now();
        // 5 activity_day chunks within the window — source is not 'session'
        let conn = db.lock().unwrap();
        for i in 0..5i64 {
            let dt = now - chrono::Duration::days(i);
            let ts = dt.format("%Y-%m-%d %H:%M:%S").to_string();
            conn.execute(
                "INSERT INTO ai_chunks \
                 (id, source, source_ref, text, embedding, created_at, embedded_at) \
                 VALUES (?, 'activity_day', 'ref', 'day chunk', zeroblob(1536), ?, ?)",
                params![format!("act-{i}"), ts, ts],
            )
            .expect("insert activity_day chunk");
        }
        drop(conn);
        assert!(!has_minimum_data(&db));
    }
}
