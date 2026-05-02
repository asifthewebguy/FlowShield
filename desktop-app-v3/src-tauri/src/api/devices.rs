//! Device-registration call. POST /api/devices upserts a row keyed by
//! `deviceId` (unique on the web side) and bumps `lastSyncAt` /
//! `lastActiveAt` so the dashboard's "Connected Devices" card shows
//! the desktop online.
//!
//! Best-effort: callers spawn this as a background task and ignore
//! errors — registration failure shouldn't block login or session end.

use crate::error::{AppError, AppResult};

/// POST /api/devices. Returns Ok on any 2xx; non-success surfaces as
/// `AppError::Api` for the caller to log (and ignore).
pub async fn register_device(
    http: &reqwest::Client,
    token: &str,
    device_id: &str,
    device_name: &str,
    platform: &str,
    app_version: &str,
) -> AppResult<()> {
    let url = format!("{}/api/devices", super::api_base_url());
    let res = http
        .post(&url)
        .bearer_auth(token)
        .json(&serde_json::json!({
            "deviceId": device_id,
            "deviceName": device_name,
            "platform": platform,
            "appVersion": app_version,
        }))
        .send()
        .await?;

    let status = res.status();
    if status.is_success() {
        return Ok(());
    }
    let message = res
        .text()
        .await
        .unwrap_or_else(|_| "device registration failed".to_string());
    Err(AppError::Api {
        status: status.as_u16(),
        message,
        code: None,
    })
}
