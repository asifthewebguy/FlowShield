//! Cosine similarity + top-k search over stored embeddings.
//!
//! For v1 we keep the entire corpus in memory and compare against the query
//! vector. FlowShield's data volume is tiny — even a heavy user has < 10K
//! chunks, so brute-force cosine is fast (<10ms) and avoids pulling in a
//! vector-DB dependency. We can swap to sqlite-vec later if scale demands.

use crate::ai::embedder::EMBEDDING_DIM;

/// Cosine similarity between two vectors of equal length. Both inputs are
/// expected to be unit-normalized (every Embedder we ship returns unit
/// vectors), in which case this reduces to a simple dot product. We don't
/// re-normalize defensively — that would mask bugs upstream.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len(), "cosine_similarity dim mismatch");
    let mut dot = 0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
    }
    dot
}

/// Sanity-check helper used in retriever public API — panics if dims wrong,
/// preventing silent garbage from a model swap.
pub fn assert_dim(v: &[f32]) {
    assert_eq!(v.len(), EMBEDDING_DIM, "expected dim {EMBEDDING_DIM}, got {}", v.len());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit(mut v: Vec<f32>) -> Vec<f32> {
        let n = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        for x in &mut v {
            *x /= n;
        }
        v
    }

    #[test]
    fn identical_vectors_score_one() {
        let v = unit(vec![1.0, 2.0, 3.0]);
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn orthogonal_vectors_score_zero() {
        let a = unit(vec![1.0, 0.0]);
        let b = unit(vec![0.0, 1.0]);
        assert!(cosine_similarity(&a, &b).abs() < 1e-5);
    }

    #[test]
    fn opposite_vectors_score_negative_one() {
        let v = unit(vec![1.0, 2.0, 3.0]);
        let opp: Vec<f32> = v.iter().map(|x| -x).collect();
        assert!((cosine_similarity(&v, &opp) + 1.0).abs() < 1e-5);
    }
}
