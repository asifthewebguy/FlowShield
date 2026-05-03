//! Tauri command handlers. Every public function here is registered in
//! [`crate::run`] via `invoke_handler!`. Keeping handlers in their own
//! modules makes the per-feature surface obvious.

pub mod auth;
pub mod blocking;
mod elevation;
pub mod ping;
pub mod preferences;
pub mod projects;
pub mod realtime;
pub mod sessions;
pub mod tray;
