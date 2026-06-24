//! Model file registry — URL + sha256 + size for every file we download.
//!
//! Updating a model means: change the entry here, change the `model_id` /
//! `embedder_id` constants downstream, and ship a release. The `ai_model_state`
//! sha256 column gates whether re-download is needed (sha256 mismatch on disk
//! triggers redownload).
//!
//! All sha256 hashes are real, verified values — Plan 1.3 filled the embedder
//! hashes, Plan 1.4 filled the LLM hashes (Phi-3-mini-4k-instruct-q4, verified
//! 2026-05-07 against upstream HuggingFace artifacts).

/// Identifier baked into `ai_briefings.model_id` for cache invalidation.
pub const LLM_ID: &str = "phi-3-mini-4k-instruct-q4";

/// BGE-small-en-v1.5 embedder identifier.
pub const EMBEDDER_ID: &str = "bge-small-en-v1.5";

/// Single file in the model bundle.
#[derive(Debug, Clone, Copy)]
pub struct ModelFile {
    /// Absolute URL on HuggingFace's CDN.
    pub url: &'static str,
    /// Filename relative to `app_data_dir/models/`.
    pub local_filename: &'static str,
    /// Expected sha256 in lowercase hex. Empty string ("") means "no verify
    /// during Plan 1.2 — to be filled by Plan 1.3/1.4 when we have a real
    /// download to hash". Production callers MUST refuse to mark a model
    /// `Ready` if the placeholder is empty.
    pub sha256: &'static str,
    /// Size in bytes. Used for disk-space precheck + progress bars.
    pub size_bytes: u64,
}

/// Files that make up the LLM bundle. Phi-3-mini-4k-instruct ships as a
/// quantized GGUF + a tokenizer.json (the GGUF doesn't carry tokenizer
/// vocab in a form candle-transformers' quantized_phi3 reads).
pub const LLM_FILES: &[ModelFile] = &[
    ModelFile {
        url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
        local_filename: "phi-3-mini-4k-instruct/Phi-3-mini-4k-instruct-q4.gguf",
        sha256: "8a83c7fb9049a9b2e92266fa7ad04933bb53aa1e85136b7b30f1b8000ff2edef",  // real upstream sha256 — verified 2026-05-07
        size_bytes: 2_393_231_072,
    },
    ModelFile {
        url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct/resolve/main/tokenizer.json",
        local_filename: "phi-3-mini-4k-instruct/tokenizer.json",
        sha256: "072ab882d6c7192a42f78790945d16c064691321a73251a4b18f6a380f0fbe39",  // real upstream sha256 — verified 2026-05-07
        size_bytes: 1_937_869,
    },
];

/// Files that make up the embedder bundle. BGE-small-en-v1.5 ships as
/// safetensors + tokenizer + config.
pub const EMBEDDER_FILES: &[ModelFile] = &[
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/model.safetensors",
        local_filename: "bge-small-en-v1.5/model.safetensors",
        sha256: "3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad",  // real upstream sha256 — verified 2026-05-07
        size_bytes: 135_000_000,
    },
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/tokenizer.json",
        local_filename: "bge-small-en-v1.5/tokenizer.json",
        sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66",  // real upstream sha256 — verified 2026-05-07
        size_bytes: 700_000,
    },
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/config.json",
        local_filename: "bge-small-en-v1.5/config.json",
        sha256: "094f8e891b932f2000c92cfc663bac4c62069f5d8af5b5278c4306aef3084750",  // real upstream sha256 — verified 2026-05-07
        size_bytes: 800,
    },
];

/// All files that need to download for a complete first-run setup.
/// Concatenated in download order: LLM first (largest, slowest), then embedder.
pub fn all_files() -> Vec<&'static ModelFile> {
    LLM_FILES.iter().chain(EMBEDDER_FILES.iter()).collect()
}

/// Total bytes the user must download for a fresh install. Used by the
/// consent screen's "1.55 GB free space required" check.
pub fn total_download_bytes() -> u64 {
    all_files().iter().map(|f| f.size_bytes).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_total_matches_individual_files() {
        let llm: u64 = LLM_FILES.iter().map(|f| f.size_bytes).sum();
        let embed: u64 = EMBEDDER_FILES.iter().map(|f| f.size_bytes).sum();
        assert_eq!(total_download_bytes(), llm + embed);
    }

    #[test]
    fn all_files_includes_both_bundles() {
        let count = all_files().len();
        assert_eq!(count, LLM_FILES.len() + EMBEDDER_FILES.len());
    }

    #[test]
    fn no_duplicate_local_filenames() {
        let names: Vec<&str> = all_files().iter().map(|f| f.local_filename).collect();
        let unique: std::collections::HashSet<&&str> = names.iter().collect();
        assert_eq!(names.len(), unique.len(), "duplicate local_filename in registry");
    }

    #[test]
    fn all_registry_files_have_sha256() {
        // verify_sha256 fails closed on an empty hash; this guards against
        // shipping a registry entry that would be rejected at download time.
        for f in all_files() {
            assert!(
                !f.sha256.is_empty(),
                "missing sha256 for {}",
                f.local_filename
            );
        }
    }
}
