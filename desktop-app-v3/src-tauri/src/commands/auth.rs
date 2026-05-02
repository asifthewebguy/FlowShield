//! Auth commands. The Rust side owns the JWT — frontend never touches the
//! store directly. Token + user are persisted via tauri-plugin-store. We'll
//! upgrade to OS keychain (keyring crate) when phase 2 wires up the
//! activity tracker; for now plain-file persistence is enough to get the
//! login round-trip working.

use crate::api::{self, AuthUser};
use crate::device;
use crate::error::{AppError, AppResult};
use crate::AppState;
use serde::Serialize;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_store::StoreExt;

/// Fire-and-forget POST /api/devices so the web app's "Connected Devices"
/// card lists this desktop. No-op if the device id cache hasn't populated
/// yet (very brief launch window). Errors are logged + ignored — device
/// registration must never block authentication.
fn fire_register(state: &State<'_, AppState>, token: String) {
    let Some(device_id) = state.device_id.get().cloned() else {
        tracing::debug!("device id not cached yet; skipping registration");
        return;
    };
    let http = state.http.clone();
    tauri::async_runtime::spawn(async move {
        match api::devices::register_device(
            &http,
            &token,
            &device_id,
            &device::device_name(),
            device::platform(),
            device::app_version(),
        )
        .await
        {
            Ok(()) => tracing::info!("device registered"),
            Err(err) => tracing::warn!(?err, "device registration failed"),
        }
    });
}

const STORE_FILE: &str = "auth.bin";
const KEY_TOKEN: &str = "token";
const KEY_USER: &str = "user";

#[derive(Debug, Serialize, Clone)]
pub struct PersistedAuth {
    pub token: String,
    pub user: AuthUser,
}

#[tauri::command]
pub async fn auth_login<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    email: String,
    password: String,
) -> AppResult<PersistedAuth> {
    let response = api::login(&state.http, &email, &password, true).await?;

    persist(&app, &response.token, &response.user)?;
    *state.token.write().await = Some(response.token.clone());
    *state.user.write().await = Some(response.user.clone());

    fire_register(&state, response.token.clone());

    Ok(PersistedAuth {
        token: response.token,
        user: response.user,
    })
}

#[tauri::command]
pub async fn auth_load<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> AppResult<Option<PersistedAuth>> {
    // Cache hit: return without touching disk.
    {
        let token = state.token.read().await.clone();
        let user = state.user.read().await.clone();
        if let (Some(token), Some(user)) = (token, user) {
            fire_register(&state, token.clone());
            return Ok(Some(PersistedAuth { token, user }));
        }
    }

    // Cache miss: load from store.
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let token = store.get(KEY_TOKEN).and_then(|v| v.as_str().map(String::from));
    let user = store.get(KEY_USER).and_then(|v| serde_json::from_value::<AuthUser>(v).ok());

    match (token, user) {
        (Some(token), Some(user)) => {
            *state.token.write().await = Some(token.clone());
            *state.user.write().await = Some(user.clone());
            fire_register(&state, token.clone());
            Ok(Some(PersistedAuth { token, user }))
        }
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn auth_logout<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    *state.token.write().await = None;
    *state.user.write().await = None;

    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    store.delete(KEY_TOKEN);
    store.delete(KEY_USER);
    store.save().map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}

fn persist<R: Runtime>(app: &AppHandle<R>, token: &str, user: &AuthUser) -> AppResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    store.set(KEY_TOKEN, serde_json::Value::String(token.to_string()));
    store.set(KEY_USER, serde_json::to_value(user)?);
    store.save().map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}
