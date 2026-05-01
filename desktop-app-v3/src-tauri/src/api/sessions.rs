use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// Session as returned by the FlowShield REST API. Fields mirror the Prisma
/// model; serde rename maps snake_case Rust to camelCase JSON.
///
/// Times are RFC 3339 strings (`2026-05-01T12:34:56.789Z` shape produced by
/// JS `new Date().toISOString()`); the frontend re-parses them. We keep them
/// as strings here because the Rust layer just forwards them — no chrono
/// dependency needed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    #[serde(default)]
    pub user_id: Option<String>,
    pub start_time: String,
    #[serde(default)]
    pub end_time: Option<String>,
    pub planned_duration: i32,
    #[serde(default)]
    pub actual_duration: Option<i32>,
    pub session_type: String,
    #[serde(default)]
    pub productivity_score: Option<i32>,
    pub completed: bool,
    pub is_paused: bool,
    #[serde(default)]
    pub paused_at: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SessionEnvelope {
    session: Session,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    error: Option<String>,
    code: Option<String>,
    #[serde(rename = "activeSessionId")]
    active_session_id: Option<String>,
}

fn auth(req: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    req.bearer_auth(token)
}

/// POST /api/sessions — start a new focus session.
///
/// Returns 409 with `code: SESSION_ALREADY_ACTIVE` if the user already has a
/// non-completed session. We surface the existing session's id in the error
/// `code` field as `ACTIVE_<id>` so the frontend can jump to it instead of
/// creating a duplicate.
pub async fn start_session(
    http: &reqwest::Client,
    token: &str,
    planned_duration: i32,
    session_type: &str,
) -> AppResult<Session> {
    let url = format!("{}/api/sessions", super::api_base_url());
    let res = auth(http.post(&url), token)
        .json(&serde_json::json!({
            "plannedDuration": planned_duration,
            "sessionType": session_type,
        }))
        .send()
        .await?;

    let status = res.status();
    if status.is_success() {
        return Ok(res.json::<SessionEnvelope>().await?.session);
    }

    let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody {
        error: None,
        code: None,
        active_session_id: None,
    });
    Err(AppError::Api {
        status: status.as_u16(),
        message: body.error.unwrap_or_else(|| "Failed to start session".into()),
        code: body.code.or_else(|| body.active_session_id.map(|id| format!("ACTIVE_{}", id))),
    })
}

/// GET /api/sessions/active — null if no active session.
pub async fn get_active_session(
    http: &reqwest::Client,
    token: &str,
) -> AppResult<Option<Session>> {
    let url = format!("{}/api/sessions/active", super::api_base_url());
    let res = auth(http.get(&url), token).send().await?;

    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    let status = res.status();
    if !status.is_success() {
        let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody {
            error: None,
            code: None,
            active_session_id: None,
        });
        return Err(AppError::Api {
            status: status.as_u16(),
            message: body.error.unwrap_or_else(|| "Failed to fetch active session".into()),
            code: body.code,
        });
    }

    // Endpoint returns either { session: Session | null } or null.
    #[derive(Deserialize)]
    struct ActiveEnvelope {
        session: Option<Session>,
    }
    let body: serde_json::Value = res.json().await?;
    if body.is_null() {
        return Ok(None);
    }
    let parsed: ActiveEnvelope = serde_json::from_value(body)?;
    Ok(parsed.session)
}

/// PATCH /api/sessions/[id] — completes / updates a session.
pub async fn end_session(
    http: &reqwest::Client,
    token: &str,
    session_id: &str,
    productivity_score: Option<i32>,
) -> AppResult<Session> {
    let url = format!("{}/api/sessions/{}", super::api_base_url(), session_id);
    let res = auth(http.patch(&url), token)
        .json(&serde_json::json!({
            "endTime": now_iso(),
            "completed": true,
            "productivityScore": productivity_score,
        }))
        .send()
        .await?;

    let status = res.status();
    if !status.is_success() {
        let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody {
            error: None,
            code: None,
            active_session_id: None,
        });
        return Err(AppError::Api {
            status: status.as_u16(),
            message: body.error.unwrap_or_else(|| "Failed to end session".into()),
            code: body.code,
        });
    }
    Ok(res.json::<SessionEnvelope>().await?.session)
}

/// POST /api/sessions/[id]/toggle-pause — body { action: "pause" | "resume" }
pub async fn toggle_pause(
    http: &reqwest::Client,
    token: &str,
    session_id: &str,
    action: &str,
) -> AppResult<Session> {
    let url = format!("{}/api/sessions/{}/toggle-pause", super::api_base_url(), session_id);
    let res = auth(http.post(&url), token)
        .json(&serde_json::json!({ "action": action }))
        .send()
        .await?;

    let status = res.status();
    if !status.is_success() {
        let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody {
            error: None,
            code: None,
            active_session_id: None,
        });
        return Err(AppError::Api {
            status: status.as_u16(),
            message: body.error.unwrap_or_else(|| "Failed to toggle pause".into()),
            code: body.code,
        });
    }
    Ok(res.json::<SessionEnvelope>().await?.session)
}

/// Current UTC time as RFC 3339 (`YYYY-MM-DDTHH:MM:SS.mmmZ`). Inlined so we
/// avoid pulling chrono just for this. Algorithm: Howard Hinnant's
/// civil_from_days inverse — battle-tested and obvious enough to verify.
fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let millis = dur.subsec_millis();
    let (year, month, day, hour, minute, second) = unix_to_utc(secs);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, minute, second, millis
    )
}

fn unix_to_utc(secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    let days = (secs / 86_400) as i64;
    let secs_of_day = (secs % 86_400) as u32;
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year as i32, m as u32, d as u32, hour, minute, second)
}
