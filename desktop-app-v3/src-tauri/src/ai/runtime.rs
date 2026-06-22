//! LLM inference trait + mock for tests. Concrete impl lands in Plan 1.2.

use crate::error::AiError;
use async_trait::async_trait;

/// Local-LLM inference contract. The substrate (corpus, retriever, prompts)
/// only depends on this trait; concrete implementations (candle-based) land
/// in Plan 1.2. Tests use `MockLlmRuntime` to avoid loading 1.4 GB of weights.
#[async_trait]
pub trait LlmRuntime: Send + Sync {
    /// Generate up to `max_tokens` of completion text from the supplied
    /// prompt. Returns the full output as a single string (streaming token
    /// callbacks are a Plan 1.3 concern, not a substrate one).
    async fn generate(&self, prompt: &str, max_tokens: usize) -> Result<String, AiError>;

    /// Identifier baked into the cache key for `ai_briefings`. When this
    /// changes (e.g. after a model upgrade), every cached briefing is
    /// invalidated and re-generated lazily.
    fn model_id(&self) -> &str;
}

/// In-memory mock returning canned strings. Used by every substrate test
/// that exercises orchestration without the real model.
#[cfg(test)]
pub struct MockLlmRuntime {
    pub canned_response: String,
    pub id: &'static str,
}

#[cfg(test)]
impl Default for MockLlmRuntime {
    fn default() -> Self {
        Self {
            canned_response: "mock briefing: you focused 3.2h yesterday.".to_string(),
            id: "mock-llm-v0",
        }
    }
}

#[cfg(test)]
#[async_trait]
impl LlmRuntime for MockLlmRuntime {
    async fn generate(&self, _prompt: &str, _max_tokens: usize) -> Result<String, AiError> {
        Ok(self.canned_response.clone())
    }
    fn model_id(&self) -> &str {
        self.id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mock_returns_canned_response() {
        let mock = MockLlmRuntime::default();
        let out = mock.generate("anything", 100).await.unwrap();
        assert!(out.contains("mock briefing"));
        assert_eq!(mock.model_id(), "mock-llm-v0");
    }

    #[tokio::test]
    async fn mock_response_can_be_overridden() {
        let mock = MockLlmRuntime {
            canned_response: "custom".to_string(),
            id: "custom-id",
        };
        assert_eq!(mock.generate("p", 1).await.unwrap(), "custom");
        assert_eq!(mock.model_id(), "custom-id");
    }
}
