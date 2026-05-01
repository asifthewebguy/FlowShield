use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: AuthUser,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    error: Option<String>,
    code: Option<String>,
}

/// POST /api/auth/login. Decodes the standard error shape and propagates
/// `code` (e.g. EMAIL_NOT_VERIFIED) through to the frontend so screens can
/// show specific copy.
pub async fn login(
    http: &reqwest::Client,
    email: &str,
    password: &str,
    remember_me: bool,
) -> AppResult<LoginResponse> {
    let url = format!("{}/api/auth/login", super::api_base_url());

    let response = http
        .post(&url)
        .json(&serde_json::json!({
            "email": email,
            "password": password,
            "rememberMe": remember_me,
        }))
        .send()
        .await?;

    let status = response.status();

    if status.is_success() {
        return Ok(response.json::<LoginResponse>().await?);
    }

    let body: ApiErrorBody = response
        .json()
        .await
        .unwrap_or(ApiErrorBody { error: None, code: None });

    Err(AppError::Api {
        status: status.as_u16(),
        message: body.error.unwrap_or_else(|| "Login failed".to_string()),
        code: body.code,
    })
}
