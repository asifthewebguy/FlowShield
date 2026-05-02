//! FlowShield REST API client. All HTTP lives here so the rest of the crate
//! talks to a typed surface and doesn't sprinkle `reqwest` calls through the
//! command layer.

mod auth;
pub mod activity;
pub mod devices;
pub mod preferences;
pub mod projects;
pub mod realtime;
pub mod sessions;

pub use auth::{login, AuthUser};
pub use preferences::Preferences;
pub use realtime::RealtimeConfig;
pub use sessions::Session;

/// Default API base URL. Overrideable at runtime via the `FLOWSHIELD_API_URL`
/// env var so dev / staging / preview environments don't need recompiles.
pub fn api_base_url() -> String {
    std::env::var("FLOWSHIELD_API_URL").unwrap_or_else(|_| "https://flowshield.app".to_string())
}
