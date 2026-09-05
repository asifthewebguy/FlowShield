use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// Task as returned by the FlowShield REST API. Fields mirror the Prisma
/// model; serde rename maps snake_case Rust to camelCase JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub estimate_minutes: Option<i32>,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default)]
    pub scheduled_start: Option<String>,
    #[serde(default)]
    pub scheduled_end: Option<String>,
    pub status: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct TaskEnvelope {
    task: Task,
}

#[derive(Debug, Deserialize)]
struct TasksEnvelope {
    tasks: Vec<Task>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    error: Option<String>,
    code: Option<String>,
}

fn auth(req: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    req.bearer_auth(token)
}

async fn error_from_response(res: reqwest::Response) -> AppError {
    let status = res.status();
    let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody { error: None, code: None });
    AppError::Api {
        status: status.as_u16(),
        message: body.error.unwrap_or_else(|| "Task request failed".into()),
        code: body.code,
    }
}

/// GET /api/tasks — list the user's tasks.
pub async fn list_tasks(http: &reqwest::Client, token: &str) -> AppResult<Vec<Task>> {
    let url = format!("{}/api/tasks", super::api_base_url());
    let res = auth(http.get(&url), token).send().await?;
    if !res.status().is_success() {
        return Err(error_from_response(res).await);
    }
    let envelope: TasksEnvelope = res.json().await?;
    Ok(envelope.tasks)
}

/// POST /api/tasks — create a task with just a title (+ optional project).
pub async fn create_task(
    http: &reqwest::Client,
    token: &str,
    title: &str,
    project_id: Option<&str>,
) -> AppResult<Task> {
    let url = format!("{}/api/tasks", super::api_base_url());
    let mut body = serde_json::json!({ "title": title });
    if let Some(pid) = project_id {
        body["projectId"] = serde_json::Value::String(pid.to_string());
    }
    let res = auth(http.post(&url), token).json(&body).send().await?;
    if !res.status().is_success() {
        return Err(error_from_response(res).await);
    }
    let envelope: TaskEnvelope = res.json().await?;
    Ok(envelope.task)
}

/// PATCH /api/tasks/{id} — `patch` is forwarded verbatim as the request body
/// (e.g. `{"status": "DONE"}`), so callers control exactly which fields change.
pub async fn update_task(
    http: &reqwest::Client,
    token: &str,
    id: &str,
    patch: serde_json::Value,
) -> AppResult<Task> {
    let url = format!("{}/api/tasks/{}", super::api_base_url(), id);
    let res = auth(http.patch(&url), token).json(&patch).send().await?;
    if !res.status().is_success() {
        return Err(error_from_response(res).await);
    }
    let envelope: TaskEnvelope = res.json().await?;
    Ok(envelope.task)
}

/// DELETE /api/tasks/{id}
pub async fn delete_task(http: &reqwest::Client, token: &str, id: &str) -> AppResult<()> {
    let url = format!("{}/api/tasks/{}", super::api_base_url(), id);
    let res = auth(http.delete(&url), token).send().await?;
    if !res.status().is_success() {
        return Err(error_from_response(res).await);
    }
    Ok(())
}
