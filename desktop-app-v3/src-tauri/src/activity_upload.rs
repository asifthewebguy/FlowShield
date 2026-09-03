//! Ships persisted activity buckets to the API. Two callers: the 60 s
//! `sync_worker` tick and `session_end` (so a just-finished session shows
//! up on the web dashboard without waiting for the next tick).

use crate::api;
use crate::error::AppError;
use crate::store::{self, Db};
use crate::tracker::ActivitySample;
use std::sync::Arc;
use tokio::sync::RwLock;

pub const UPLOAD_BATCH: i64 = 200;
pub const RETENTION_SECS: i64 = 90 * 24 * 60 * 60;

/// Strip window titles and URLs when the user opted out of sharing them.
/// App and process names still go up so web analytics keep working at
/// the app level.
pub fn redact(samples: Vec<ActivitySample>, share_window_details: bool) -> Vec<ActivitySample> {
    if share_window_details {
        return samples;
    }
    samples
        .into_iter()
        .map(|mut s| {
            s.window_title = String::new();
            s.url = None;
            s
        })
        .collect()
}

/// Fetch the current preference fresh on every call and refresh the cache
/// as a side effect. This is called from the sync worker's 60 s tick (and
/// once at session end), so a network round trip here is cheap and
/// infrequent — trusting a cache indefinitely would let the desktop keep
/// uploading real window titles/URLs for a long time after the user
/// toggles `shareWindowDetails` off from the web profile page.
/// Fails closed: if preferences cannot be fetched we redact. On a failed
/// fetch the stale cache (if any) is left untouched rather than cleared,
/// so other cache readers still see the last known-good value.
pub async fn resolve_share_flag(
    http: &reqwest::Client,
    token: &str,
    cache: &Arc<RwLock<Option<api::Preferences>>>,
) -> bool {
    match api::preferences::get_preferences(http, token).await {
        Ok(p) => {
            let flag = p.share_window_details;
            *cache.write().await = Some(p);
            flag
        }
        Err(err) => {
            tracing::warn!(?err, "preferences unavailable; redacting titles for this upload");
            false
        }
    }
}

/// Upload one batch of closed, unsynced rows. Returns how many were sent.
///
/// Retention (`purge_older_than`) always runs, regardless of whether the
/// upload below succeeds, fails retryably, or fails permanently — it must
/// not be gated behind a successful sync or `activity_local` grows
/// unbounded whenever uploads are stuck.
///
/// A network error or 5xx response is retryable: the batch is left
/// unsynced and picked up again next tick. A 4xx response means the
/// server is permanently rejecting this exact batch (validation failure,
/// bad request) — retrying it forever would wedge the queue, so those
/// rows are marked synced (dropped) and the drop is logged.
pub async fn upload_once(
    http: &reqwest::Client,
    token: &str,
    db: &Db,
    share_window_details: bool,
) -> crate::error::AppResult<usize> {
    let result = upload_batch(http, token, db, share_window_details).await;

    let purged = store::activity_local::purge_older_than(db, RETENTION_SECS)?;
    if purged > 0 {
        tracing::debug!(purged, "activity_local retention purge");
    }

    result
}

async fn upload_batch(
    http: &reqwest::Client,
    token: &str,
    db: &Db,
    share_window_details: bool,
) -> crate::error::AppResult<usize> {
    let rows = store::activity_local::closed_unsynced(db, UPLOAD_BATCH)?;
    if rows.is_empty() {
        return Ok(0);
    }
    let ids: Vec<i64> = rows.iter().map(|r| r.id).collect();
    let samples = redact(rows.into_iter().map(|r| r.sample).collect(), share_window_details);
    if let Err(err) = api::activity::sync_activity(http, token, &samples).await {
        if let AppError::Api { status, .. } = &err {
            let status = *status;
            if (400..500).contains(&status) {
                tracing::warn!(
                    status,
                    rows = ids.len(),
                    "batch permanently rejected by server; dropping rows to unblock the queue"
                );
                store::activity_local::mark_synced(db, &ids)?;
                return Ok(0);
            }
        }
        return Err(err);
    }
    store::activity_local::mark_synced(db, &ids)?;
    Ok(ids.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn s(title: &str, url: Option<&str>) -> ActivitySample {
        ActivitySample {
            application_name: "Firefox".into(),
            process_name: "firefox".into(),
            window_title: title.into(),
            url: url.map(str::to_string),
            timestamp: "2026-09-03T10:00:00.000Z".into(),
            duration_seconds: 9,
            session_id: Some("sess".into()),
        }
    }

    #[test]
    fn redact_is_identity_when_sharing() {
        let input = vec![s("Bank statement", Some("https://bank.example"))];
        assert_eq!(redact(input.clone(), true), input);
    }

    #[test]
    fn redact_strips_title_and_url_but_keeps_everything_else() {
        let out = redact(vec![s("Bank statement", Some("https://bank.example"))], false);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].window_title, "");
        assert_eq!(out[0].url, None);
        assert_eq!(out[0].application_name, "Firefox");
        assert_eq!(out[0].process_name, "firefox");
        assert_eq!(out[0].duration_seconds, 9);
        assert_eq!(out[0].session_id.as_deref(), Some("sess"));
    }

    // `FLOWSHIELD_API_URL` is read process-wide by `api::api_base_url()`.
    // Tests run in parallel threads within one process, so any test that
    // points it at a mock server must hold this lock for the full
    // set-env -> await -> unset-env span to avoid another such test's
    // request landing on the wrong mock server.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn test_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        crate::store::apply_migrations(&conn).unwrap();
        Arc::new(std::sync::Mutex::new(conn))
    }

    #[tokio::test]
    async fn resolve_share_flag_defaults_to_false_when_preferences_unreachable() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/user/preferences"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("FLOWSHIELD_API_URL", server.uri());
        let http = reqwest::Client::new();
        let cache: Arc<RwLock<Option<api::Preferences>>> = Arc::new(RwLock::new(None));
        let shared = resolve_share_flag(&http, "token", &cache).await;
        std::env::remove_var("FLOWSHIELD_API_URL");
        drop(_guard);

        assert!(
            !shared,
            "must fail closed (do not share) when preferences can't be fetched"
        );
        assert!(
            cache.read().await.is_none(),
            "a failed fetch must not poison the cache with a fabricated value"
        );
    }

    #[tokio::test]
    async fn resolve_share_flag_picks_up_changed_preference_on_second_call() {
        let server_true = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/user/preferences"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "preferences": {"primaryDistractions": [], "shareWindowDetails": true}
            })))
            .mount(&server_true)
            .await;

        let server_false = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/user/preferences"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "preferences": {"primaryDistractions": [], "shareWindowDetails": false}
            })))
            .mount(&server_false)
            .await;

        let _guard = ENV_LOCK.lock().unwrap();
        let http = reqwest::Client::new();
        let cache: Arc<RwLock<Option<api::Preferences>>> = Arc::new(RwLock::new(None));

        std::env::set_var("FLOWSHIELD_API_URL", server_true.uri());
        let first = resolve_share_flag(&http, "token", &cache).await;

        std::env::set_var("FLOWSHIELD_API_URL", server_false.uri());
        let second = resolve_share_flag(&http, "token", &cache).await;

        std::env::remove_var("FLOWSHIELD_API_URL");
        drop(_guard);

        assert!(first, "first call should read the initial true value");
        assert!(
            !second,
            "second call must refetch rather than return the first call's cached value"
        );
    }

    #[tokio::test]
    async fn upload_once_leaves_rows_unsynced_when_post_fails() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/activity/sync"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let db = test_db();
        let id = store::activity_local::insert_open(&db, &s("Doc", None)).unwrap();
        store::activity_local::close(&db, id, 9).unwrap();

        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("FLOWSHIELD_API_URL", server.uri());
        let http = reqwest::Client::new();
        let result = upload_once(&http, "token", &db, true).await;
        std::env::remove_var("FLOWSHIELD_API_URL");
        drop(_guard);

        assert!(result.is_err(), "a failed POST must surface as an error");
        let rows = store::activity_local::closed_unsynced(&db, 10).unwrap();
        assert_eq!(
            rows.len(),
            1,
            "row must remain unsynced (available for retry) after a failed upload"
        );
    }

    #[tokio::test]
    async fn upload_once_marks_synced_on_success() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/activity/sync"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"message": "ok", "synced": 1})),
            )
            .mount(&server)
            .await;

        let db = test_db();
        let id = store::activity_local::insert_open(&db, &s("Doc", None)).unwrap();
        store::activity_local::close(&db, id, 9).unwrap();

        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("FLOWSHIELD_API_URL", server.uri());
        let http = reqwest::Client::new();
        let uploaded = upload_once(&http, "token", &db, true).await.unwrap();
        std::env::remove_var("FLOWSHIELD_API_URL");
        drop(_guard);

        assert_eq!(uploaded, 1);
        assert!(
            store::activity_local::closed_unsynced(&db, 10)
                .unwrap()
                .is_empty(),
            "row must be marked synced after a successful upload"
        );
    }

    #[tokio::test]
    async fn upload_once_drops_batch_on_permanent_4xx_rejection() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/activity/sync"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "error": "validation failed"
            })))
            .mount(&server)
            .await;

        let db = test_db();
        let id = store::activity_local::insert_open(&db, &s("Doc", None)).unwrap();
        store::activity_local::close(&db, id, 9).unwrap();

        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("FLOWSHIELD_API_URL", server.uri());
        let http = reqwest::Client::new();
        let result = upload_once(&http, "token", &db, true).await;
        std::env::remove_var("FLOWSHIELD_API_URL");
        drop(_guard);

        assert_eq!(
            result.unwrap(),
            0,
            "a permanently rejected batch must not be reported as uploaded"
        );
        assert!(
            store::activity_local::closed_unsynced(&db, 10)
                .unwrap()
                .is_empty(),
            "a batch rejected with 4xx must be marked synced (dropped) instead of retried forever"
        );
    }

    #[tokio::test]
    async fn upload_once_purges_expired_rows_even_when_the_upload_fails() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/activity/sync"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let db = test_db();
        let id = store::activity_local::insert_open(&db, &s("Doc", None)).unwrap();
        store::activity_local::close(&db, id, 9).unwrap();
        // Backdate the row past the retention window directly — the public
        // API always stamps `created_at` with "now".
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "UPDATE activity_local SET created_at = created_at - ?1",
                rusqlite::params![RETENTION_SECS + 1],
            )
            .unwrap();
        }

        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("FLOWSHIELD_API_URL", server.uri());
        let http = reqwest::Client::new();
        let result = upload_once(&http, "token", &db, true).await;
        std::env::remove_var("FLOWSHIELD_API_URL");
        drop(_guard);

        assert!(
            result.is_err(),
            "the retryable 5xx failure must still surface as an error"
        );
        let remaining: i64 = db
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM activity_local", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            remaining, 0,
            "retention purge must run even though the upload attempt failed"
        );
    }
}
