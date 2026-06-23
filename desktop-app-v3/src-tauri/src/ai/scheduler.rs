//! Briefing scheduler. Ticks every 60s; fires the day-rollup (Phase 1.6b)
//! and evening reflection question (Phase 1.6c). Briefing generation is
//! fully manual — see `ai_briefing_generate` command.

use chrono::Timelike;

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};

pub fn spawn(
    app_handle: AppHandle,
    db: crate::store::Db,
    embedder_slot: Arc<std::sync::OnceLock<Arc<crate::ai::candle_embedder::CandleEmbedder>>>,
    in_flight: Arc<std::sync::atomic::AtomicBool>,
    model_dir: PathBuf,
) {
    tauri::async_runtime::spawn(async move {
        // 60s warmup so we don't fire on the literal first tick.
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;

            let now = chrono::Local::now();
            let labs = read_labs_flag(&app_handle);
            // get_model_state takes &Connection; lock briefly to query, then drop guard.
            let status = {
                let conn = match db.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                };
                match crate::store::ai::get_model_state(&conn) {
                    Ok(Some(state)) => state.status,
                    _ => crate::store::ai::ModelStatus::NotStarted,
                }
            };

            // Phase 1.6b — roll up yesterday into a [Day] chunk once per day.
            if let Some(yesterday) = now.date_naive().pred_opt() {
                let yday_id = crate::ai::indexer::stable_chunk_id(
                    crate::store::ai::ChunkSource::ActivityDay,
                    &yesterday.to_string(),
                );
                let already = {
                    match db.lock() {
                        Ok(conn) => crate::store::ai::chunk_exists(&conn, &yday_id).unwrap_or(true),
                        Err(_) => true, // fail closed — skip this tick
                    }
                };
                if crate::ai::indexer::should_roll_up(labs, status.clone(), already) {
                    match crate::ai::indexer::run_day_rollup(&db, &embedder_slot, &model_dir, yesterday).await {
                        Ok(true) => tracing::info!(date = %yesterday, "indexed day rollup chunk"),
                        Ok(false) => {} // no sessions that day
                        Err(e) => tracing::warn!(?e, date = %yesterday, "day rollup failed"),
                    }
                }
            }

            // Phase 1.6c — evening reflection question (once per day, ≥18:00).
            {
                let today = now.date_naive();
                let already = {
                    match db.lock() {
                        Ok(conn) => crate::store::ai::get_reflection_by_date(&conn, &today.to_string())
                            .map(|r| r.is_some())
                            .unwrap_or(true),
                        Err(_) => true, // fail closed
                    }
                };
                if crate::ai::reflection::should_generate_reflection(labs, status.clone(), now.hour(), already) {
                    match crate::ai::reflection::generate_and_store_question(&db, &in_flight, &model_dir, today).await {
                        Ok(true) => {
                            tracing::info!(date = %today, "generated reflection question");
                            let _ = app_handle.emit("ai-reflection-ready", today.to_string());
                        }
                        Ok(false) => {}
                        Err(e) => tracing::warn!(?e, "reflection generation failed"),
                    }
                }
            }

        }
    });
}

fn read_labs_flag(app: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    match app.store("settings.json") {
        Ok(store) => store
            .get("ai.labs.enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        Err(_) => false,
    }
}
