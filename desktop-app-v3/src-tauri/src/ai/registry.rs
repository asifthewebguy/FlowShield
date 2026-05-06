//! Model file registry — URL + sha256 + size for every file we download.
//!
//! Updating a model means: change the entry here, change the `model_id` /
//! `embedder_id` constants downstream, and ship a release. The `ai_model_state`
//! sha256 column gates whether re-download is needed (sha256 mismatch on disk
//! triggers redownload).
//!
//! The sha256 placeholders below are PLACEHOLDERS confirmed during Plan 1.3
//! (embedder) and Plan 1.4 (LLM). Plan 1.2 wires the infra; Plans 1.3+1.4 fill
//! in real hashes once they download the artifacts and verify against the
//! upstream HuggingFace published sha256s.

/// Identifier baked into `ai_briefings.model_id` for cache invalidation.
pub const LLM_ID: &str = "gemma-2-2b-it-q4_k_m";

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

/// Files that make up the LLM bundle. Gemma-2-2B Q4_K_M is a single GGUF.
pub const LLM_FILES: &[ModelFile] = &[
    ModelFile {
        url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf",
        local_filename: "gemma-2-2b-it-Q4_K_M.gguf",
        sha256: "",  // PLACEHOLDER — Plan 1.4 fills with real hash
        size_bytes: 1_500_000_000, // ~1.5 GB; refined in Plan 1.4
    },
];

/// Files that make up the embedder bundle. BGE-small-en-v1.5 ships as
/// safetensors + tokenizer + config.
pub const EMBEDDER_FILES: &[ModelFile] = &[
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/model.safetensors",
        local_filename: "bge-small-en-v1.5/model.safetensors",
        sha256: "",  // PLACEHOLDER — Plan 1.3 fills
        size_bytes: 135_000_000,
    },
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/tokenizer.json",
        local_filename: "bge-small-en-v1.5/tokenizer.json",
        sha256: "",  // PLACEHOLDER — Plan 1.3 fills
        size_bytes: 700_000,
    },
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/config.json",
        local_filename: "bge-small-en-v1.5/config.json",
        sha256: "",  // PLACEHOLDER — Plan 1.3 fills
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
}
