//! Foreground-window activity tracker.
//!
//! Polls `active_win_pos_rs::get_active_window()` once per second while a
//! focus session is running. Buckets consecutive same-window samples into
//! single `ActivitySample` entries (so a 5-minute YouTube binge becomes one
//! 300-second sample, not 300 one-second rows). On session end the
//! command layer drains the buffer and POSTs to `/api/activity/sync`.
//!
//! Phase 3 keeps this entirely in memory — phase 4 will add a SQLite-backed
//! buffer so samples survive a crash mid-session.
//!
//! Platform notes:
//! - **Windows / macOS / Linux X11**: works.
//! - **Linux Wayland (default in Fedora 43 + GNOME)**: most compositors
//!   refuse to expose foreground window title to non-privileged clients.
//!   `active-win-pos-rs` will return Err(()) on every poll and we log+skip
//!   silently. Sessions still run; the desktop just doesn't generate
//!   activity logs in this configuration. Improving this is out of scope
//!   for phase 3 (would need either a per-compositor D-Bus/portal
//!   integration or kernel-level tracing).

use crate::api::sessions::now_iso;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;

/// One bucketed observation of "user was looking at <window> for <N>s".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySample {
    pub application_name: String,
    pub process_name: String,
    pub window_title: String,
    pub url: Option<String>,
    /// RFC 3339 — when the bucket started.
    pub timestamp: String,
    pub duration_seconds: u64,
}

pub struct TrackerHandle {
    buffer: Arc<Mutex<Vec<ActivitySample>>>,
    stop_tx: Option<oneshot::Sender<()>>,
    join: Option<JoinHandle<()>>,
}

impl TrackerHandle {
    /// Spawn a background polling task. The task runs until `stop_and_drain`
    /// is called (or the runtime drops).
    pub fn spawn() -> Self {
        let buffer: Arc<Mutex<Vec<ActivitySample>>> = Arc::new(Mutex::new(Vec::new()));
        let buffer_clone = buffer.clone();
        let (stop_tx, mut stop_rx) = oneshot::channel::<()>();

        let join = tokio::spawn(async move {
            // `current` is the in-progress bucket. We append it to the buffer
            // when the foreground window changes (or when we stop).
            let mut current: Option<ActivitySample> = None;
            let mut interval = tokio::time::interval(Duration::from_secs(1));

            loop {
                tokio::select! {
                    _ = &mut stop_rx => break,
                    _ = interval.tick() => {
                        let win = match active_win_pos_rs::get_active_window() {
                            Ok(w) => w,
                            Err(_) => continue, // Wayland or transient failure
                        };

                        let process_name = win
                            .process_path
                            .file_name()
                            .map(|s| s.to_string_lossy().into_owned())
                            .unwrap_or_default();

                        let app_name = if win.app_name.is_empty() {
                            process_name.clone()
                        } else {
                            win.app_name.clone()
                        };

                        match current.as_mut() {
                            Some(s)
                                if s.application_name == app_name
                                    && s.window_title == win.title =>
                            {
                                // Same window as last tick — extend the bucket.
                                s.duration_seconds = s.duration_seconds.saturating_add(1);
                            }
                            _ => {
                                // Window changed — flush the previous bucket and start a new one.
                                if let Some(prev) = current.take() {
                                    if prev.duration_seconds >= 1 {
                                        buffer_clone.lock().await.push(prev);
                                    }
                                }
                                current = Some(ActivitySample {
                                    application_name: app_name,
                                    process_name,
                                    window_title: win.title,
                                    url: None,
                                    timestamp: now_iso(),
                                    duration_seconds: 1,
                                });
                            }
                        }
                    }
                }
            }

            // Final flush of the in-progress bucket.
            if let Some(prev) = current {
                if prev.duration_seconds >= 1 {
                    buffer_clone.lock().await.push(prev);
                }
            }
        });

        Self {
            buffer,
            stop_tx: Some(stop_tx),
            join: Some(join),
        }
    }

    /// Stop the polling task and return everything we collected.
    pub async fn stop_and_drain(mut self) -> Vec<ActivitySample> {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        if let Some(j) = self.join.take() {
            let _ = j.await;
        }
        let mut buf = self.buffer.lock().await;
        std::mem::take(&mut *buf)
    }
}
