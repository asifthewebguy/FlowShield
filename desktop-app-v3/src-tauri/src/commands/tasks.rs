//! Task commands. Reads go straight to the API. Writes try the API first;
//! on a network failure (not a validation failure — those are the user's
//! fault and should surface immediately) they enqueue into
//! `pending_task_ops` for `sync_worker` to replay later, and return
//! optimistically so the UI doesn't block on connectivity.

use crate::api::{self, Task};
use crate::error::{AppError, AppResult};
use crate::store;
use crate::AppState;
use tauri::State;

async fn token_or_err(state: &State<'_, AppState>) -> AppResult<String> {
    state
        .token
        .read()
        .await
        .clone()
        .ok_or_else(|| AppError::Api {
            status: 401,
            message: "Not authenticated".into(),
            code: Some("UNAUTHENTICATED".into()),
        })
}

/// A network-layer failure (server unreachable) is retryable offline; an API
/// error the server actually answered (4xx/5xx) is not — surface it.
fn is_offline(err: &AppError) -> bool {
    matches!(err, AppError::Network(_))
}

/// Ids minted by `tasks_create` while offline. They exist only in this
/// process until `sync_worker` replays the create, so no PATCH/DELETE can
/// ever succeed against them — refuse early instead of queueing a doomed op.
fn is_pending_id(id: &str) -> bool {
    id.starts_with("pending-")
}

fn not_synced_err() -> AppError {
    AppError::Api {
        status: 409,
        message: "Task has not synced yet — try again once you're back online".into(),
        code: Some("TASK_NOT_SYNCED".into()),
    }
}

/// `tasks_list` — GET /api/tasks.
#[tauri::command]
pub async fn tasks_list(state: State<'_, AppState>) -> AppResult<Vec<Task>> {
    let token = token_or_err(&state).await?;
    api::tasks::list_tasks(&state.http, &token).await
}

/// `tasks_create` — POST /api/tasks with { title, projectId? }. On a network
/// failure, queues the create and returns a locally-synthesized Task with a
/// temporary id so the UI can render it immediately; the real id replaces it
/// once `sync_worker` successfully replays the queued op and the next
/// `tasks_list` refresh runs.
#[tauri::command]
pub async fn tasks_create(
    state: State<'_, AppState>,
    title: String,
    project_id: Option<String>,
) -> AppResult<Task> {
    let token = token_or_err(&state).await?;
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(AppError::Api {
            status: 400,
            message: "Task title is required".into(),
            code: Some("INVALID_TITLE".into()),
        });
    }
    match api::tasks::create_task(&state.http, &token, trimmed, project_id.as_deref()).await {
        Ok(task) => Ok(task),
        Err(err) if is_offline(&err) => {
            if let Some(db) = state.db.get() {
                let payload = serde_json::json!({ "title": trimmed, "projectId": project_id }).to_string();
                store::pending_task_ops::enqueue(db, "create", &payload)?;
            }
            Ok(Task {
                id: format!("pending-{}", uuid_v4_ish()),
                title: trimmed.to_string(),
                notes: None,
                project_id,
                estimate_minutes: None,
                due_at: None,
                scheduled_start: None,
                scheduled_end: None,
                status: "TODO".into(),
                tags: Vec::new(),
            })
        }
        Err(err) => Err(err),
    }
}

/// `tasks_update` — PATCH /api/tasks/{id} with an arbitrary JSON patch
/// object. Queues offline the same way `tasks_create` does; the caller's
/// optimistic UI state is the source of truth for what the patch should look
/// like once it lands.
#[tauri::command]
pub async fn tasks_update(
    state: State<'_, AppState>,
    id: String,
    patch: serde_json::Value,
) -> AppResult<()> {
    if is_pending_id(&id) {
        return Err(not_synced_err());
    }
    let token = token_or_err(&state).await?;
    match api::tasks::update_task(&state.http, &token, &id, patch.clone()).await {
        Ok(_) => Ok(()),
        Err(err) if is_offline(&err) => {
            if let Some(db) = state.db.get() {
                let payload = serde_json::json!({ "id": id, "patch": patch }).to_string();
                store::pending_task_ops::enqueue(db, "update", &payload)?;
            }
            Ok(())
        }
        Err(err) => Err(err),
    }
}

/// `tasks_delete` — DELETE /api/tasks/{id}.
#[tauri::command]
pub async fn tasks_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if is_pending_id(&id) {
        return Err(not_synced_err());
    }
    let token = token_or_err(&state).await?;
    match api::tasks::delete_task(&state.http, &token, &id).await {
        Ok(()) => Ok(()),
        Err(err) if is_offline(&err) => {
            if let Some(db) = state.db.get() {
                let payload = serde_json::json!({ "id": id }).to_string();
                store::pending_task_ops::enqueue(db, "delete", &payload)?;
            }
            Ok(())
        }
        Err(err) => Err(err),
    }
}

/// Cheap, dependency-free unique-enough suffix for a temporary offline id.
/// Not a real UUID — just needs to not collide within one offline session.
fn uuid_v4_ish() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{nanos:x}")
}
