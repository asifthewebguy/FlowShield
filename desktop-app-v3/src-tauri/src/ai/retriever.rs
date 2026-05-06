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

use crate::store::ai::Chunk;

/// Rank a list of chunks by cosine similarity to `query` and return the top
/// `k` (or all chunks, whichever is smaller) sorted by similarity descending.
/// Chunks with mismatched embedding dimensionality are skipped silently —
/// this happens transiently during model swaps when the indexer hasn't yet
/// re-embedded older rows.
pub fn top_k_by_cosine(query: &[f32], mut chunks: Vec<Chunk>, k: usize) -> Vec<(Chunk, f32)> {
    assert_dim(query);
    chunks.retain(|c| c.embedding.len() == EMBEDDING_DIM);

    let mut scored: Vec<(Chunk, f32)> = chunks
        .into_iter()
        .map(|c| {
            let sim = cosine_similarity(query, &c.embedding);
            (c, sim)
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(k);
    scored
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

    use crate::store::ai::{Chunk, ChunkSource};

    fn make_chunk(id: &str, text: &str, embedding: Vec<f32>) -> Chunk {
        Chunk {
            id: id.into(),
            source: ChunkSource::Session,
            source_ref: id.into(),
            text: text.into(),
            embedding,
            created_at: "2026-05-05T00:00:00Z".into(),
            embedded_at: "2026-05-05T00:00:00Z".into(),
        }
    }

    fn unit_dim384(seed: f32) -> Vec<f32> {
        let mut v = vec![0f32; EMBEDDING_DIM];
        v[0] = seed;
        v[1] = 1.0;
        let n = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        for x in &mut v {
            *x /= n;
        }
        v
    }

    #[test]
    fn top_k_returns_chunks_in_similarity_order() {
        let query = unit_dim384(10.0);
        let chunks = vec![
            make_chunk("near", "a", unit_dim384(10.0)),
            make_chunk("mid",  "b", unit_dim384(5.0)),
            make_chunk("far",  "c", unit_dim384(0.0)),
        ];
        let ranked = top_k_by_cosine(&query, chunks, 3);
        assert_eq!(ranked.len(), 3);
        assert_eq!(ranked[0].0.id, "near");
        assert_eq!(ranked[1].0.id, "mid");
        assert_eq!(ranked[2].0.id, "far");
        assert!(ranked[0].1 >= ranked[1].1);
        assert!(ranked[1].1 >= ranked[2].1);
    }

    #[test]
    fn top_k_truncates_to_k() {
        let query = unit_dim384(1.0);
        let chunks: Vec<Chunk> = (0..10)
            .map(|i| make_chunk(&format!("c{i}"), "x", unit_dim384(i as f32)))
            .collect();
        let ranked = top_k_by_cosine(&query, chunks, 3);
        assert_eq!(ranked.len(), 3);
    }

    #[test]
    fn top_k_skips_chunks_with_wrong_dim() {
        let query = unit_dim384(1.0);
        let bad = make_chunk("bad", "x", vec![0f32; 100]);
        let good = make_chunk("good", "x", unit_dim384(1.0));
        let ranked = top_k_by_cosine(&query, vec![bad, good], 5);
        assert_eq!(ranked.len(), 1);
        assert_eq!(ranked[0].0.id, "good");
    }
}
