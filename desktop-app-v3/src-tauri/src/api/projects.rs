use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// Project as returned by the FlowShield REST API. Only the fields the
/// desktop client cares about — the web has hourlyRate/budget/plannedHours
/// for cost tracking which v3 alpha doesn't surface.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProjectsEnvelope {
    projects: Vec<Project>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    error: Option<String>,
    code: Option<String>,
}

fn auth(req: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    req.bearer_auth(token)
}

/// GET /api/projects — list the user's projects. Returns `[]` if none.
///
/// Web endpoint envelopes as `{ projects: [...] }` but defensively also
/// accepts a bare array if a future migration changes the shape.
pub async fn list_projects(http: &reqwest::Client, token: &str) -> AppResult<Vec<Project>> {
    let url = format!("{}/api/projects", super::api_base_url());
    let res = auth(http.get(&url), token).send().await?;

    let status = res.status();
    if !status.is_success() {
        let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody {
            error: None,
            code: None,
        });
        return Err(AppError::Api {
            status: status.as_u16(),
            message: body.error.unwrap_or_else(|| "Failed to load projects".into()),
            code: body.code,
        });
    }

    let body: serde_json::Value = res.json().await?;
    if let Ok(envelope) = serde_json::from_value::<ProjectsEnvelope>(body.clone()) {
        return Ok(envelope.projects);
    }
    if let Ok(direct) = serde_json::from_value::<Vec<Project>>(body) {
        return Ok(direct);
    }
    Ok(Vec::new())
}

/// POST /api/projects — create a new project owned by the current user.
/// `color` is optional; server defaults to `#3b82f6`.
pub async fn create_project(
    http: &reqwest::Client,
    token: &str,
    name: &str,
) -> AppResult<Project> {
    let url = format!("{}/api/projects", super::api_base_url());
    let res = auth(http.post(&url), token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await?;

    let status = res.status();
    if status.is_success() {
        // Web returns either { project } or the bare project; accept both.
        let body: serde_json::Value = res.json().await?;
        if let Some(inner) = body.get("project").cloned() {
            return Ok(serde_json::from_value::<Project>(inner)?);
        }
        return Ok(serde_json::from_value::<Project>(body)?);
    }

    let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody {
        error: None,
        code: None,
    });
    Err(AppError::Api {
        status: status.as_u16(),
        message: body.error.unwrap_or_else(|| "Failed to create project".into()),
        code: body.code,
    })
}
