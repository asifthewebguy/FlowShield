use crate::error::{AppError, AppResult};
use crate::tracker::ActivitySample;
use serde::{Deserialize, Serialize};

/// Per-activity wire format. Matches the FlowShield `/api/activity/sync`
/// endpoint exactly. Fields are camelCase JSON.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivityPayload {
    timestamp: String,
    application_name: String,
    process_name: String,
    window_title: String,
    url: Option<String>,
    duration_seconds: u64,
    category: &'static str,
    activity_level: i32,
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    error: Option<String>,
    code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SyncResult {
    #[serde(default)]
    pub synced: Option<i32>,
}

/// POST /api/activity/sync — uploads activity samples. Each sample carries
/// its own optional session id.
///
/// Server-side `resolveCategory` does the real category resolution from
/// the user's CategoryRule table; we always send `category: "Unknown"`
/// from the desktop in phase 3 and let the server decide.
pub async fn sync_activity(
    http: &reqwest::Client,
    token: &str,
    samples: &[ActivitySample],
) -> AppResult<SyncResult> {
    if samples.is_empty() {
        return Ok(SyncResult { synced: Some(0) });
    }

    let activities: Vec<ActivityPayload> = samples
        .iter()
        .map(|s| ActivityPayload {
            timestamp: s.timestamp.clone(),
            application_name: s.application_name.clone(),
            process_name: s.process_name.clone(),
            window_title: s.window_title.clone(),
            url: s.url.clone(),
            duration_seconds: s.duration_seconds,
            category: "Unknown",
            activity_level: 0,
            session_id: s.session_id.clone(),
        })
        .collect();
    let activities_len = activities.len();

    let url = format!("{}/api/activity/sync", super::api_base_url());
    let res = http
        .post(&url)
        .bearer_auth(token)
        .json(&serde_json::json!({
            "activities": activities,
            "source": "desktop",
        }))
        .send()
        .await?;

    let status = res.status();
    if status.is_success() {
        return Ok(res.json::<SyncResult>().await.unwrap_or(SyncResult {
            synced: Some(activities_len as i32),
        }));
    }

    let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody {
        error: None,
        code: None,
    });
    Err(AppError::Api {
        status: status.as_u16(),
        message: body.error.unwrap_or_else(|| "Activity sync failed".into()),
        code: body.code,
    })
}
