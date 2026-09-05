//! Background uploader. Wakes every minute and does three jobs:
//!   1. Legacy: drain `pending_activity_sync` rows (queued by pre-Phase-1
//!      builds at session end) with exponential backoff.
//!   2. Ship closed, unsynced `activity_local` rows via `activity_upload`.
//!   3. Replay queued `pending_task_ops` mutations (task create/update/delete
//!      that failed while offline).
//!
//! Spawned once on app launch. Skips silently when signed out.

use crate::activity_upload;
use crate::api;
use crate::error::{AppError, AppResult};
use crate::store::{self, Db};
use crate::tracker::ActivitySample;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

const TICK_SECS: u64 = 60;
const BATCH_SIZE: i64 = 16;

pub fn spawn(
    http: reqwest::Client,
    token: Arc<RwLock<Option<String>>>,
    db: Db,
    prefs_cache: Arc<RwLock<Option<api::Preferences>>>,
) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(TICK_SECS));
        loop {
            tick.tick().await;
            if let Err(err) = drain_once(&http, &token, &db, &prefs_cache).await {
                tracing::warn!(?err, "sync tick failed");
            }
        }
    });
}

async fn drain_once(
    http: &reqwest::Client,
    token: &Arc<RwLock<Option<String>>>,
    db: &Db,
    prefs_cache: &Arc<RwLock<Option<api::Preferences>>>,
) -> crate::error::AppResult<()> {
    let token = match token.read().await.clone() {
        Some(t) => t,
        None => return Ok(()),
    };

    // Job 1 — legacy queue.
    let rows = store::pending_sync::ready_rows(db, BATCH_SIZE)?;
    for row in rows {
        let samples: Vec<ActivitySample> = row
            .samples
            .iter()
            .cloned()
            .map(|mut s| {
                if s.session_id.is_none() {
                    s.session_id = Some(row.session_id.clone());
                }
                s
            })
            .collect();
        match api::activity::sync_activity(http, &token, &samples).await {
            Ok(_) => {
                store::pending_sync::delete(db, row.id)?;
                tracing::info!(session_id = %row.session_id, samples = samples.len(), "legacy pending sync drained");
            }
            Err(err) => {
                store::pending_sync::record_failure(db, row.id, row.retry_count)?;
                tracing::debug!(?err, session_id = %row.session_id, "legacy drain failed; backing off");
            }
        }
    }

    // Job 2 — always-on tracker rows.
    let share = activity_upload::resolve_share_flag(http, &token, prefs_cache).await;
    match activity_upload::upload_once(http, &token, db, share).await {
        Ok(0) => {}
        Ok(n) => tracing::info!(uploaded = n, redacted = !share, "activity_local uploaded"),
        Err(err) => tracing::debug!(?err, "activity_local upload failed; will retry next tick"),
    }

    // Job 3 — queued task mutations.
    let task_rows = store::pending_task_ops::ready_rows(db, BATCH_SIZE)?;
    for row in task_rows {
        // A malformed payload can never succeed. Drop it and move on — a `?`
        // here would abort this tick (and Jobs 1–2 on every later tick) for
        // as long as the row exists.
        let v: serde_json::Value = match serde_json::from_str(&row.payload) {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!(?err, id = row.id, op = %row.op, "dropping unparseable pending task op");
                store::pending_task_ops::delete(db, row.id)?;
                continue;
            }
        };
        let result: AppResult<()> = match row.op.as_str() {
            "create" => {
                let title = v["title"].as_str().unwrap_or_default();
                let project_id = v["projectId"].as_str();
                api::tasks::create_task(http, &token, title, project_id).await.map(|_| ())
            }
            "update" => {
                let id = v["id"].as_str().unwrap_or_default();
                api::tasks::update_task(http, &token, id, v["patch"].clone()).await.map(|_| ())
            }
            "delete" => {
                let id = v["id"].as_str().unwrap_or_default();
                api::tasks::delete_task(http, &token, id).await
            }
            _ => Ok(()), // unknown op — drop rather than retry forever
        };
        match result {
            Ok(()) => {
                store::pending_task_ops::delete(db, row.id)?;
                tracing::info!(op = %row.op, "queued task op replayed");
            }
            // The server answered and rejected it (404 task deleted meanwhile,
            // 400 validation, …). Retrying cannot change that answer — same
            // rule as `activity_upload::upload_once` on a 4xx.
            Err(AppError::Api { status, .. }) if (400..500).contains(&status) => {
                tracing::warn!(op = %row.op, status, "queued task op permanently rejected; dropping");
                store::pending_task_ops::delete(db, row.id)?;
            }
            Err(err) => {
                store::pending_task_ops::record_failure(db, row.id, row.retry_count)?;
                tracing::debug!(?err, op = %row.op, "task op replay failed; backing off");
            }
        }
    }
    Ok(())
}
