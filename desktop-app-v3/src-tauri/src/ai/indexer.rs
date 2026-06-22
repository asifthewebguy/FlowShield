//! Shared corpus indexing: embed chunk text and upsert it as one ai_chunks
//! row. Idempotent via a deterministic id derived from (source, source_ref).

use crate::ai::embedder::Embedder;
use crate::error::AppError;
use crate::store::ai::{self as store_ai, Chunk, ChunkSource};
use crate::store::Db;

/// Deterministic row id for an indexed chunk. Same (source, source_ref) →
/// same id → `INSERT OR REPLACE` overwrites instead of duplicating.
/// Note: the `:` separator is collision-free as long as `source_ref` contains no
/// colon — guaranteed for session UUIDs and ISO date strings.
pub fn stable_chunk_id(source: ChunkSource, source_ref: &str) -> String {
    format!("{}:{}", source.as_str(), source_ref)
}

/// Embed `text` and upsert it as one ai_chunks row. Best-effort callers
/// should log and swallow the error; the function itself surfaces it so
/// tests can assert success.
pub async fn index_chunk<E: Embedder + ?Sized>(
    db: &Db,
    embedder: &E,
    source: ChunkSource,
    source_ref: &str,
    created_at: &str,
    text: String,
) -> Result<(), AppError> {
    tracing::debug!(source = source.as_str(), source_ref, "indexing chunk");
    let embedding = embedder.embed(&text).await?; // AiError -> AppError via From
    let chunk = Chunk {
        id: stable_chunk_id(source, source_ref),
        source,
        source_ref: source_ref.to_string(),
        text,
        embedding,
        created_at: created_at.to_string(),
        embedded_at: chrono::Utc::now().to_rfc3339(),
    };
    let conn = db
        .lock()
        .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
    store_ai::insert_chunk(&conn, &chunk)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::embedder::MockEmbedder;
    use crate::store;

    fn open_test_db() -> Db {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    #[test]
    fn stable_id_is_deterministic_and_source_scoped() {
        let a = stable_chunk_id(ChunkSource::Session, "sid-1");
        let b = stable_chunk_id(ChunkSource::Session, "sid-1");
        let c = stable_chunk_id(ChunkSource::ActivityDay, "sid-1");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[tokio::test]
    async fn index_chunk_inserts_one_row() {
        let db = open_test_db();
        let emb = MockEmbedder::default();
        index_chunk(&db, &emb, ChunkSource::Session, "sid-1", "2026-06-23T10:00:00Z", "[Session] text".into())
            .await
            .unwrap();
        let conn = db.lock().unwrap();
        assert_eq!(store_ai::count_chunks(&conn).unwrap(), 1);
    }

    #[tokio::test]
    async fn index_chunk_is_idempotent_for_same_source_ref() {
        let db = open_test_db();
        let emb = MockEmbedder::default();
        for _ in 0..3 {
            index_chunk(&db, &emb, ChunkSource::Session, "sid-1", "2026-06-23T10:00:00Z", "[Session] text".into())
                .await
                .unwrap();
        }
        let conn = db.lock().unwrap();
        assert_eq!(store_ai::count_chunks(&conn).unwrap(), 1, "same source_ref must not duplicate");
    }
}
