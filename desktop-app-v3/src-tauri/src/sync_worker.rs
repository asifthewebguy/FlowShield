//! Background drainer for `pending_activity_sync`. Wakes every minute,
//! picks rows whose `next_retry_at <= now`, retries the POST, and either
//! deletes (success) or schedules backoff (failure).
//!
//! Spawned once on app launch. Skips work silently when:
//!   - the user is signed out (no token), or
//!   - the queue is empty (no rows to drain).

use crate::api;
use crate::store::{self, Db};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

const TICK_SECS: u64 = 60;
const BATCH_SIZE: i64 = 16;

pub fn spawn(http: reqwest::Client, token: Arc<RwLock<Option<String>>>, db: Db) {
    // `tauri::async_runtime::spawn` (vs `tokio::spawn`) so this works when
    // called from Tauri's `setup` callback — that runs synchronously before
    // any task is on a runtime. Tauri's async_runtime IS tokio under the
    // hood, so `tokio::time::interval` / `tokio::sync::RwLock` inside the
    // future continue to work.
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(TICK_SECS));
        loop {
            tick.tick().await;
            if let Err(err) = drain_once(&http, &token, &db).await {
                tracing::warn!(?err, "offline-sync drain failed");
            }
        }
    });
}

async fn drain_once(
    http: &reqwest::Client,
    token: &Arc<RwLock<Option<String>>>,
    db: &Db,
) -> crate::error::AppResult<()> {
    let token = match token.read().await.clone() {
        Some(t) => t,
        None => return Ok(()),
    };

    let rows = store::pending_sync::ready_rows(db, BATCH_SIZE)?;
    if rows.is_empty() {
        return Ok(());
    }
    let count = rows.len();
    tracing::debug!(count, "draining pending activity-sync rows");

    for row in rows {
        match api::activity::sync_activity(http, &token, &row.session_id, &row.samples).await {
            Ok(_) => {
                store::pending_sync::delete(db, row.id)?;
                tracing::info!(
                    session_id = %row.session_id,
                    samples = row.samples.len(),
                    "pending activity sync drained"
                );
            }
            Err(err) => {
                store::pending_sync::record_failure(db, row.id, row.retry_count)?;
                tracing::debug!(
                    ?err,
                    session_id = %row.session_id,
                    retry = row.retry_count + 1,
                    "drain attempt failed; backing off"
                );
            }
        }
    }
    Ok(())
}
