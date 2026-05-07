//! Briefing scheduler. Ticks every 60s; fires `briefing::generate` when
//! local time has crossed 5am AND no row in `ai_briefings` exists for
//! today's date AND labs are enabled AND the model is `Ready` AND there's
//! enough recent activity.
//!
//! The "≥5am" rather than "==5am" guard handles laptops asleep through
//! 5am — the first tick after wake fires the pipeline.

use chrono::{DateTime, Local, Timelike};

use crate::ai::empty_state;
use crate::ai::registry::LLM_ID;
use crate::store::ai::{get_briefing_for, ModelStatus};
use crate::store::Db;

const FIRE_FROM_HOUR_LOCAL: u32 = 5;

pub fn should_fire(
    now_local: DateTime<Local>,
    db: &Db,
    labs_enabled: bool,
    model_status: ModelStatus,
) -> bool {
    if !labs_enabled {
        return false;
    }
    if !matches!(model_status, ModelStatus::Ready) {
        return false;
    }
    if now_local.hour() < FIRE_FROM_HOUR_LOCAL {
        return false;
    }
    let today = now_local.date_naive().to_string();
    let conn = match db.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    if get_briefing_for(&conn, &today, LLM_ID)
        .unwrap_or(None)
        .is_some()
    {
        return false;
    }
    drop(conn);
    if !empty_state::has_minimum_data(db) {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store;
    use crate::store::ai::{upsert_briefing, Briefing};
    use chrono::TimeZone;
    use rusqlite::params;
    use tempfile::tempdir;

    fn open_test_db() -> Db {
        let tmp = tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    /// Insert 5 session chunks into ai_chunks within the last 7 days so
    /// `has_minimum_data` returns true.
    fn seed_min_sessions(db: &Db) {
        let conn = db.lock().unwrap();
        let now = chrono::Utc::now();
        for i in 0..5i64 {
            let dt = now - chrono::Duration::days(i);
            let ts = dt.format("%Y-%m-%d %H:%M:%S").to_string();
            conn.execute(
                "INSERT INTO ai_chunks \
                 (id, source, source_ref, text, embedding, created_at, embedded_at) \
                 VALUES (?, 'session', 'ref', 'session text', zeroblob(1536), ?, ?)",
                params![format!("seed-chunk-{}", i), ts, ts],
            )
            .expect("seed session chunk");
        }
    }

    #[test]
    fn fires_at_5am_with_no_cached_row_and_enough_data() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 5, 30, 0).unwrap();
        assert!(should_fire(now, &db, true, ModelStatus::Ready));
    }

    #[test]
    fn fires_after_5am_post_sleep() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 9, 15, 0).unwrap();
        assert!(should_fire(now, &db, true, ModelStatus::Ready));
    }

    #[test]
    fn skips_before_5am() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 4, 59, 0).unwrap();
        assert!(!should_fire(now, &db, true, ModelStatus::Ready));
    }

    #[test]
    fn skips_when_labs_disabled() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 6, 0, 0).unwrap();
        assert!(!should_fire(now, &db, false, ModelStatus::Ready));
    }

    #[test]
    fn skips_when_model_not_ready() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 6, 0, 0).unwrap();
        assert!(!should_fire(now, &db, true, ModelStatus::Downloading));
        assert!(!should_fire(now, &db, true, ModelStatus::NotStarted));
        assert!(!should_fire(now, &db, true, ModelStatus::Error));
        assert!(!should_fire(now, &db, true, ModelStatus::Disabled));
    }

    #[test]
    fn skips_when_briefing_already_cached_today() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 6, 0, 0).unwrap();
        let today = now.date_naive().to_string();
        {
            let conn = db.lock().unwrap();
            upsert_briefing(
                &conn,
                &Briefing {
                    date: today.clone(),
                    text: "cached briefing".to_string(),
                    generated_at: "2026-05-08T05:00:00Z".to_string(),
                    model_id: LLM_ID.to_string(),
                },
            )
            .unwrap();
        }
        assert!(!should_fire(now, &db, true, ModelStatus::Ready));
    }

    #[test]
    fn skips_when_below_data_threshold() {
        let db = open_test_db();
        // no seed — empty db → has_minimum_data returns false
        let now = Local.with_ymd_and_hms(2026, 5, 8, 6, 0, 0).unwrap();
        assert!(!should_fire(now, &db, true, ModelStatus::Ready));
    }
}
