//! User preferences fetcher. Right now the only caller is the deep-work
//! card on the dashboard, which needs the `primaryDistractions` list to
//! pass to `blocking_apply`. Other fields on the web's `UserPreferences`
//! row (workStyle, preferredDuration, breakReminders, …) are ignored —
//! they'll be wired up to settings UI when v3 grows that surface.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(default)]
    pub primary_distractions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct PreferencesEnvelope {
    preferences: Preferences,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    error: Option<String>,
    code: Option<String>,
}

/// GET /api/user/preferences. Returns defaults (empty distraction list)
/// if the user hasn't saved any preferences yet (web returns 404 in
/// that case).
pub async fn get_preferences(http: &reqwest::Client, token: &str) -> AppResult<Preferences> {
    let url = format!("{}/api/user/preferences", super::api_base_url());
    let res = http.get(&url).bearer_auth(token).send().await?;

    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Preferences::default());
    }

    let status = res.status();
    if !status.is_success() {
        let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody {
            error: None,
            code: None,
        });
        return Err(AppError::Api {
            status: status.as_u16(),
            message: body
                .error
                .unwrap_or_else(|| "Failed to load preferences".into()),
            code: body.code,
        });
    }

    let body: serde_json::Value = res.json().await?;
    if let Ok(env) = serde_json::from_value::<PreferencesEnvelope>(body.clone()) {
        return Ok(env.preferences);
    }
    // Defensive: accept a bare Preferences object too if the envelope
    // shape ever changes server-side.
    Ok(serde_json::from_value::<Preferences>(body).unwrap_or_default())
}
