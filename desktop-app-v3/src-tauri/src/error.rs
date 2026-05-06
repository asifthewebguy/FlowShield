use serde::Serialize;
use thiserror::Error;

/// Error categories specific to the AI substrate. Wrapped by `AppError::Ai`
/// when bubbled to the Tauri command layer; tests inspect the inner variant
/// directly. Counters of these variants are the only AI telemetry we ship —
/// content (prompts, outputs, embeddings) is never logged.
#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("model not loaded: {0}")]
    ModelLoad(String),

    #[error("model download failed: {0}")]
    ModelDownload(String),

    #[error("inference failed: {0}")]
    Inference(String),

    #[error("tokenizer failed: {0}")]
    Tokenize(String),

    #[error("out of memory during inference")]
    OutOfMemory,

    #[error("disk full: need {needed_mb} MB, have {available_mb} MB")]
    DiskFull { needed_mb: u64, available_mb: u64 },

    #[error("ai feature disabled by user setting")]
    Disabled,

    #[error("ai data corpus has fewer than {min} chunks; need more sessions")]
    InsufficientData { min: usize },
}

/// All errors the Rust backend can surface to the frontend. Wire format
/// mirrors the FlowShield REST API so React error-handling can branch on
/// `code` regardless of source.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("api error: {message}")]
    Api {
        status: u16,
        message: String,
        code: Option<String>,
    },

    #[error("storage error: {0}")]
    Storage(String),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("ai: {0}")]
    Ai(#[from] AiError),
}

#[derive(Debug, Serialize)]
struct AppErrorWire {
    error: String,
    message: String,
    code: Option<String>,
    status: Option<u16>,
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let wire = match self {
            AppError::Api {
                status,
                message,
                code,
            } => AppErrorWire {
                error: "api".into(),
                message: message.clone(),
                code: code.clone(),
                status: Some(*status),
            },
            AppError::Network(e) => AppErrorWire {
                error: "network".into(),
                message: e.to_string(),
                code: None,
                status: None,
            },
            AppError::Storage(msg) => AppErrorWire {
                error: "storage".into(),
                message: msg.clone(),
                code: None,
                status: None,
            },
            AppError::Serde(e) => AppErrorWire {
                error: "serde".into(),
                message: e.to_string(),
                code: None,
                status: None,
            },
            AppError::Ai(e) => AppErrorWire {
                error: "ai".into(),
                message: e.to_string(),
                code: None,
                status: None,
            },
        };
        wire.serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
