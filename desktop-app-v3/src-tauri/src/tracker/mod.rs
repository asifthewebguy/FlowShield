//! Foreground-window activity tracker — always on while the app runs.
//!
//! Polls `active_win_pos_rs::get_active_window()` once per second, folds
//! consecutive same-window samples into buckets via the pure `step()`
//! function, and persists every bucket to `activity_local` as it opens
//! (checkpointing its duration every `CHECKPOINT_TICKS` seconds). Buckets
//! close on window change, AFK idle, tray pause, or an explicit `flush()`.
//! The `sync_worker` uploads closed buckets in the background.
//!
//! Sessions no longer own the tracker: `AppState.active_session_id` is
//! read on every tick and recorded on the bucket, so session start/end
//! becomes a label on a continuous timeline.
//!
//! Platform notes:
//! - **Windows / macOS / Linux X11**: works.
//! - **Linux Wayland**: most compositors refuse to expose the foreground
//!   window; we get `Poll::Unavailable` every tick and record nothing.
//!   `user-idle` also lacks a pure-Wayland backend; XWayland fallback
//!   works on most GNOME/KDE setups.

use crate::api::sessions::now_iso;
use crate::error::AppResult;
use crate::store::{self, Db};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::{mpsc, oneshot, RwLock};

/// Treat the user as away-from-keyboard after this many seconds of OS-level
/// idle. Five minutes is a common-sense threshold — short enough to catch
/// real breaks, long enough to ignore reading/thinking pauses.
const IDLE_THRESHOLD_SECS: u64 = 5 * 60;

/// Persist the open bucket's duration this often so a crash loses at
/// most this many seconds of the current window.
const CHECKPOINT_TICKS: u32 = 30;

/// Payload of the `tracker-idle-started` / `tracker-idle-ended` events.
/// For `started`, `idle_seconds` is the threshold that was just crossed.
/// For `ended`, it is the whole stretch the user was away.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdlePayload {
    pub idle_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdleTransition {
    Started(IdlePayload),
    Ended(IdlePayload),
}

/// Pure edge detector over the OS idle counter. Fed once per tick; reports
/// the tick the user crosses `IDLE_THRESHOLD_SECS` and the tick they come
/// back. Owns no clock — the caller supplies `idle_secs`, so it is trivially
/// unit-testable.
#[derive(Debug, Default)]
pub struct IdleDetector {
    was_idle: bool,
    last_idle_secs: u64,
}

impl IdleDetector {
    pub fn observe(&mut self, idle_secs: u64) -> Option<IdleTransition> {
        let is_idle = idle_secs >= IDLE_THRESHOLD_SECS;
        let transition = match (self.was_idle, is_idle) {
            (false, true) => Some(IdleTransition::Started(IdlePayload { idle_seconds: idle_secs })),
            (true, false) => Some(IdleTransition::Ended(IdlePayload { idle_seconds: self.last_idle_secs })),
            _ => None,
        };
        if is_idle {
            self.last_idle_secs = idle_secs;
        }
        self.was_idle = is_idle;
        transition
    }
}

/// One bucketed observation of "user was looking at <window> for <N>s".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySample {
    pub application_name: String,
    pub process_name: String,
    pub window_title: String,
    pub url: Option<String>,
    /// RFC 3339 — when the bucket started.
    pub timestamp: String,
    pub duration_seconds: u64,
    /// Focus session that was active when this bucket opened, if any.
    /// `default` keeps old queued payloads (no field) deserialisable.
    #[serde(default)]
    pub session_id: Option<String>,
}

/// What one poll of the OS told us.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Observation {
    pub application_name: String,
    pub process_name: String,
    pub window_title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Poll {
    /// A foreground window was read.
    Window(Observation),
    /// User is AFK (or tracking is paused) — close whatever is open.
    Idle,
    /// The OS could not tell us (pure Wayland, transient error) — leave
    /// the current bucket untouched rather than mis-attributing time.
    Unavailable,
}

/// Outcome of one tick. The caller persists accordingly.
#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    Nothing,
    /// `current` grew by one second.
    Extended,
    /// A new bucket was opened; nothing was closed.
    Opened,
    /// The previous bucket (returned) closed and a new one opened.
    Rotated(ActivitySample),
    /// The previous bucket (returned) closed; nothing is open now.
    Closed(ActivitySample),
}

/// Pure bucketing logic. Consecutive ticks on the same window *and* the
/// same session extend the bucket; anything else rotates or closes it.
pub fn step(
    current: &mut Option<ActivitySample>,
    poll: Poll,
    session_id: Option<&str>,
    now_iso: &str,
) -> Step {
    match poll {
        Poll::Unavailable => Step::Nothing,
        Poll::Idle => match current.take() {
            Some(prev) => Step::Closed(prev),
            None => Step::Nothing,
        },
        Poll::Window(obs) => {
            let same = current.as_ref().map_or(false, |s| {
                s.application_name == obs.application_name
                    && s.window_title == obs.window_title
                    && s.session_id.as_deref() == session_id
            });
            if same {
                let s = current.as_mut().expect("checked above");
                s.duration_seconds = s.duration_seconds.saturating_add(1);
                return Step::Extended;
            }
            let fresh = ActivitySample {
                application_name: obs.application_name,
                process_name: obs.process_name,
                window_title: obs.window_title,
                url: None,
                timestamp: now_iso.to_string(),
                duration_seconds: 1,
                session_id: session_id.map(str::to_string),
            };
            match current.replace(fresh) {
                Some(prev) => Step::Rotated(prev),
                None => Step::Opened,
            }
        }
    }
}

pub struct TrackerConfig {
    pub db: Db,
    pub active_session_id: Arc<RwLock<Option<String>>>,
    pub paused: Arc<AtomicBool>,
    pub app: tauri::AppHandle,
}

pub struct TrackerHandle {
    flush_tx: mpsc::Sender<oneshot::Sender<()>>,
    _join: tauri::async_runtime::JoinHandle<()>,
}

impl TrackerHandle {
    /// Spawn the always-on polling task. Uses `tauri::async_runtime::spawn`
    /// so it can be called from Tauri's synchronous `setup` callback.
    pub fn spawn(cfg: TrackerConfig) -> Self {
        let (flush_tx, flush_rx) = mpsc::channel::<oneshot::Sender<()>>(4);
        let join = tauri::async_runtime::spawn(run(cfg, flush_rx));
        Self { flush_tx, _join: join }
    }

    /// Close the currently open bucket (if any) and wait until it is
    /// persisted. Used at session end so the session's last bucket is
    /// uploadable immediately.
    pub async fn flush(&self) {
        let (tx, rx) = oneshot::channel();
        if self.flush_tx.send(tx).await.is_ok() {
            let _ = rx.await;
        }
    }
}

/// Query OS idle time, but stop trying after the first failure. Some
/// XWayland setups (GNOME's notably) don't implement MIT-SCREEN-SAVER, so
/// `user_idle` fails every call — Xlib prints straight to stderr on each
/// attempt, independent of our error handling, so retrying every tick
/// means one warning per second for the life of the process.
fn os_idle_secs(query_unavailable: &mut bool) -> u64 {
    if *query_unavailable {
        return 0;
    }
    match user_idle::UserIdle::get_time() {
        Ok(t) => t.as_seconds(),
        Err(err) => {
            tracing::warn!(
                ?err,
                "OS idle-time query unavailable (no MIT-SCREEN-SAVER extension?); \
                 disabling idle detection for this session"
            );
            *query_unavailable = true;
            0
        }
    }
}

fn poll_window() -> Poll {
    match active_win_pos_rs::get_active_window() {
        Ok(win) => {
            let process_name = win
                .process_path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let application_name = if win.app_name.is_empty() {
                process_name.clone()
            } else {
                win.app_name.clone()
            };
            Poll::Window(Observation {
                application_name,
                process_name,
                window_title: win.title,
            })
        }
        Err(_) => Poll::Unavailable,
    }
}

fn emit_idle(app: &tauri::AppHandle, transition: IdleTransition) {
    let result = match transition {
        IdleTransition::Started(payload) => {
            tracing::info!(idle_seconds = payload.idle_seconds, "user went idle");
            app.emit("tracker-idle-started", payload)
        }
        IdleTransition::Ended(payload) => {
            tracing::info!(idle_seconds = payload.idle_seconds, "user came back");
            app.emit("tracker-idle-ended", payload)
        }
    };
    if let Err(err) = result {
        tracing::warn!(?err, "idle event emit failed");
    }
}

fn open_row(db: &Db, sample: Option<&ActivitySample>) -> Option<i64> {
    let s = sample?;
    match store::activity_local::insert_open(db, s) {
        Ok(id) => Some(id),
        Err(err) => {
            tracing::warn!(?err, "activity_local insert failed; bucket not persisted");
            None
        }
    }
}

fn log_write(result: AppResult<()>) {
    if let Err(err) = result {
        tracing::warn!(?err, "activity_local write failed");
    }
}

async fn run(cfg: TrackerConfig, mut flush_rx: mpsc::Receiver<oneshot::Sender<()>>) {
    let mut current: Option<ActivitySample> = None;
    let mut row_id: Option<i64> = None;
    let mut ticks_since_checkpoint: u32 = 0;
    let mut idle = IdleDetector::default();
    let mut idle_query_unavailable = false;
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    // Default `Burst` behavior replays every missed tick back-to-back after
    // a stall (slow OS call, DB contention), and each tick adds 1s to
    // `duration_seconds` — inflating the open bucket by the length of the
    // stall instead of reflecting wall-clock time. `Skip` absorbs a stall
    // as a single tick that catches up to "now".
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            Some(reply) = flush_rx.recv() => {
                if let (Some(prev), Some(id)) = (current.take(), row_id.take()) {
                    log_write(store::activity_local::close(&cfg.db, id, prev.duration_seconds));
                }
                ticks_since_checkpoint = 0;
                let _ = reply.send(());
            }
            _ = interval.tick() => {
                let idle_secs = os_idle_secs(&mut idle_query_unavailable);
                if let Some(transition) = idle.observe(idle_secs) {
                    emit_idle(&cfg.app, transition);
                }
                let poll = if cfg.paused.load(Ordering::Relaxed) || idle_secs >= IDLE_THRESHOLD_SECS {
                    Poll::Idle
                } else {
                    poll_window()
                };
                let session_id = cfg.active_session_id.read().await.clone();
                match step(&mut current, poll, session_id.as_deref(), &now_iso()) {
                    Step::Nothing => {}
                    Step::Extended => {
                        ticks_since_checkpoint += 1;
                        if ticks_since_checkpoint >= CHECKPOINT_TICKS {
                            ticks_since_checkpoint = 0;
                            if let (Some(s), Some(id)) = (current.as_ref(), row_id) {
                                log_write(store::activity_local::update_duration(&cfg.db, id, s.duration_seconds));
                            }
                        }
                    }
                    Step::Opened => {
                        ticks_since_checkpoint = 0;
                        row_id = open_row(&cfg.db, current.as_ref());
                    }
                    Step::Rotated(prev) => {
                        if let Some(id) = row_id.take() {
                            log_write(store::activity_local::close(&cfg.db, id, prev.duration_seconds));
                        }
                        ticks_since_checkpoint = 0;
                        row_id = open_row(&cfg.db, current.as_ref());
                    }
                    Step::Closed(prev) => {
                        if let Some(id) = row_id.take() {
                            log_write(store::activity_local::close(&cfg.db, id, prev.duration_seconds));
                        }
                        ticks_since_checkpoint = 0;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obs(app: &str, title: &str) -> Poll {
        Poll::Window(Observation {
            application_name: app.into(),
            process_name: format!("{app}.bin"),
            window_title: title.into(),
        })
    }

    const NOW: &str = "2026-09-03T10:00:00.000Z";

    #[test]
    fn first_window_opens_a_bucket() {
        let mut cur = None;
        let s = step(&mut cur, obs("Code", "main.rs"), Some("sess-1"), NOW);
        assert_eq!(s, Step::Opened);
        let b = cur.expect("bucket opened");
        assert_eq!(b.application_name, "Code");
        assert_eq!(b.window_title, "main.rs");
        assert_eq!(b.duration_seconds, 1);
        assert_eq!(b.timestamp, NOW);
        assert_eq!(b.session_id.as_deref(), Some("sess-1"));
    }

    #[test]
    fn same_window_extends() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let s = step(&mut cur, obs("Code", "main.rs"), None, "later");
        assert_eq!(s, Step::Extended);
        assert_eq!(cur.unwrap().duration_seconds, 2);
    }

    #[test]
    fn window_change_rotates() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let s = step(&mut cur, obs("Firefox", "docs"), None, "later");
        match s {
            Step::Rotated(prev) => {
                assert_eq!(prev.application_name, "Code");
                assert_eq!(prev.duration_seconds, 1);
            }
            other => panic!("expected Rotated, got {other:?}"),
        }
        let b = cur.unwrap();
        assert_eq!(b.application_name, "Firefox");
        assert_eq!(b.timestamp, "later");
    }

    #[test]
    fn session_change_rotates_even_for_same_window() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let s = step(&mut cur, obs("Code", "main.rs"), Some("sess-1"), "later");
        assert!(matches!(s, Step::Rotated(_)));
        assert_eq!(cur.unwrap().session_id.as_deref(), Some("sess-1"));
    }

    #[test]
    fn idle_closes_and_clears() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let s = step(&mut cur, Poll::Idle, None, "later");
        assert!(matches!(s, Step::Closed(_)));
        assert!(cur.is_none());
    }

    #[test]
    fn idle_with_nothing_open_is_nothing() {
        let mut cur = None;
        assert_eq!(step(&mut cur, Poll::Idle, None, NOW), Step::Nothing);
    }

    #[test]
    fn unavailable_keeps_current_untouched() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let before = cur.clone();
        assert_eq!(step(&mut cur, Poll::Unavailable, None, "later"), Step::Nothing);
        assert_eq!(cur, before);
    }

    #[test]
    fn session_id_survives_json_roundtrip_and_defaults_to_none() {
        let old_payload = r#"{"applicationName":"a","processName":"a","windowTitle":"t","url":null,"timestamp":"x","durationSeconds":3}"#;
        let s: ActivitySample = serde_json::from_str(old_payload).unwrap();
        assert!(s.session_id.is_none());
    }

    #[test]
    fn idle_detector_is_silent_below_threshold() {
        let mut d = IdleDetector::default();
        assert_eq!(d.observe(0), None);
        assert_eq!(d.observe(IDLE_THRESHOLD_SECS - 1), None);
        assert_eq!(d.observe(0), None);
    }

    #[test]
    fn idle_detector_fires_started_once_when_threshold_crossed() {
        let mut d = IdleDetector::default();
        assert_eq!(d.observe(IDLE_THRESHOLD_SECS - 1), None);
        assert_eq!(
            d.observe(IDLE_THRESHOLD_SECS),
            Some(IdleTransition::Started(IdlePayload { idle_seconds: IDLE_THRESHOLD_SECS }))
        );
        // Still idle: no repeat.
        assert_eq!(d.observe(IDLE_THRESHOLD_SECS + 1), None);
        assert_eq!(d.observe(IDLE_THRESHOLD_SECS + 60), None);
    }

    #[test]
    fn idle_detector_fires_ended_with_total_away_time() {
        let mut d = IdleDetector::default();
        d.observe(IDLE_THRESHOLD_SECS);
        d.observe(IDLE_THRESHOLD_SECS + 120);
        // User touches the keyboard: OS idle counter resets.
        assert_eq!(
            d.observe(0),
            Some(IdleTransition::Ended(IdlePayload { idle_seconds: IDLE_THRESHOLD_SECS + 120 }))
        );
        // Back at work: silent again.
        assert_eq!(d.observe(1), None);
    }

    #[test]
    fn idle_payload_serialises_camel_case() {
        let json = serde_json::to_string(&IdlePayload { idle_seconds: 7 }).unwrap();
        assert_eq!(json, r#"{"idleSeconds":7}"#);
    }
}
