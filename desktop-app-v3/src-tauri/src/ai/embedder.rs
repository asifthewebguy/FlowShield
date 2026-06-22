//! Embedding model trait + mock for tests. Concrete impl lands in Plan 1.2.

use crate::error::AiError;
use async_trait::async_trait;

/// Output dimensionality of every supported embedder. BGE-small produces
/// 384-dim vectors; the Plan 1.2 implementation will respect this constant
/// so retriever code can use fixed-size arrays.
pub const EMBEDDING_DIM: usize = 384;

/// Embedding model contract. Inputs go in as text; outputs come back as
/// fixed-length f32 vectors normalized to unit length (so cosine similarity
/// reduces to a dot product downstream).
#[async_trait]
pub trait Embedder: Send + Sync {
    /// Embed a single chunk of text. The output Vec<f32> always has length
    /// `EMBEDDING_DIM`; implementations panic if their underlying model
    /// produces a different dimensionality (which would be a configuration
    /// bug, not a runtime error).
    async fn embed(&self, text: &str) -> Result<Vec<f32>, AiError>;
}

/// Deterministic mock — hashes input text into a 384-dim unit vector. Used
/// by every substrate test that needs an embedder without loading BGE-small.
#[cfg(test)]
pub struct MockEmbedder;

#[cfg(test)]
impl Default for MockEmbedder {
    fn default() -> Self {
        MockEmbedder
    }
}

#[cfg(test)]
#[async_trait]
impl Embedder for MockEmbedder {
    async fn embed(&self, text: &str) -> Result<Vec<f32>, AiError> {
        // Hash the text into 384 deterministic floats by repeatedly mixing
        // bytes. Not cryptographically meaningful — just gives stable embeds
        // for the same input across test runs and varied embeds across inputs.
        let mut v = vec![0f32; EMBEDDING_DIM];
        for (i, b) in text.bytes().enumerate() {
            v[i % EMBEDDING_DIM] += (b as f32) / 255.0;
        }
        // Normalize to unit length.
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-9);
        for x in &mut v {
            *x /= norm;
        }
        Ok(v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mock_embed_produces_fixed_dim_unit_vector() {
        let m = MockEmbedder::default();
        let v = m.embed("hello world").await.unwrap();
        assert_eq!(v.len(), EMBEDDING_DIM);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5, "expected unit length, got {norm}");
    }

    #[tokio::test]
    async fn mock_embed_is_deterministic() {
        let m = MockEmbedder::default();
        let a = m.embed("repeat me").await.unwrap();
        let b = m.embed("repeat me").await.unwrap();
        assert_eq!(a, b);
    }

    #[tokio::test]
    async fn mock_embed_differs_for_different_inputs() {
        let m = MockEmbedder::default();
        let a = m.embed("apple").await.unwrap();
        let b = m.embed("zebra").await.unwrap();
        assert_ne!(a, b);
    }
}
