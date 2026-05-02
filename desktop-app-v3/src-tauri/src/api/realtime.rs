//! Realtime (Pusher Channels) configuration fetcher. The web side
//! exposes the client-safe key + cluster at /api/config/realtime so the
//! desktop doesn't have to bake them into the binary at compile time.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RealtimeConfig {
    pub key: String,
    pub cluster: String,
}

/// GET /api/config/realtime — public endpoint, no bearer token.
/// Returns empty strings if the server hasn't configured Pusher yet
/// (e.g. local dev with placeholder env). The frontend treats that as
/// "Pusher disabled, keep polling" and degrades gracefully.
pub async fn get_config(http: &reqwest::Client) -> AppResult<RealtimeConfig> {
    let url = format!("{}/api/config/realtime", super::api_base_url());
    let res = http.get(&url).send().await?;

    let status = res.status();
    if !status.is_success() {
        return Err(AppError::Api {
            status: status.as_u16(),
            message: "failed to fetch realtime config".into(),
            code: None,
        });
    }
    Ok(res.json::<RealtimeConfig>().await.unwrap_or_default())
}
