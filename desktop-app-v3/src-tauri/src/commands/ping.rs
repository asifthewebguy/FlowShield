use serde::Serialize;

#[derive(Serialize)]
pub struct PingResult {
    pub ok: bool,
    pub version: &'static str,
}

/// Smoke-test command. Frontend calls `invoke('ping')` to verify the IPC
/// boundary is wired up before doing anything user-facing.
#[tauri::command]
pub async fn ping() -> PingResult {
    PingResult {
        ok: true,
        version: env!("CARGO_PKG_VERSION"),
    }
}
