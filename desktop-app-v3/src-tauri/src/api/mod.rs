//! FlowShield REST API client. All HTTP lives here so the rest of the crate
//! talks to a typed surface and doesn't sprinkle `reqwest` calls through the
//! command layer.

mod auth;

pub use auth::{login, AuthUser, LoginResponse};

/// Default API base URL. Overrideable at runtime via the `FLOWSHIELD_API_URL`
/// env var so dev / staging / preview environments don't need recompiles.
pub fn api_base_url() -> String {
    std::env::var("FLOWSHIELD_API_URL").unwrap_or_else(|_| "https://flowshield.app".to_string())
}
