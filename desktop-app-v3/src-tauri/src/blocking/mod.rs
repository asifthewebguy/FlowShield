//! Hosts-file blocking for deep-work mode.
//!
//! Maps blocked domains to `127.0.0.1` in the OS hosts file so the browser
//! can't reach them while a focus session is active. The edit is scoped to
//! a marker-delimited region so we never disturb other entries:
//!
//! ```text
//! # >>> FlowShield blocks (do not edit by hand) <<<
//! 127.0.0.1 youtube.com
//! 127.0.0.1 www.youtube.com
//! # <<< FlowShield blocks >>>
//! ```
//!
//! Writes are atomic (temp file + rename) and a one-time backup is kept at
//! `<hosts>.flowshield-backup` before our first edit so a manual rollback is
//! always possible. Privilege check is implicit: writing the hosts file
//! requires root/admin and the OS surfaces a `PermissionDenied` error if
//! the app isn't elevated. The frontend handles that as a regular AppError.
//!
//! Phase 6 keeps this minimum-viable — no automatic session-start/end
//! integration, no `pkexec`/UAC elevation. Those land in 6.5.

use crate::error::{AppError, AppResult};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

const BEGIN_MARKER: &str = "# >>> FlowShield blocks (do not edit by hand) <<<";
const END_MARKER: &str = "# <<< FlowShield blocks >>>";
const BACKUP_SUFFIX: &str = "flowshield-backup";

fn os_hosts_path() -> PathBuf {
    if cfg!(windows) {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        PathBuf::from(system_root)
            .join("System32")
            .join("drivers")
            .join("etc")
            .join("hosts")
    } else {
        PathBuf::from("/etc/hosts")
    }
}

/// Replace any existing FlowShield-managed block region with the given
/// domains. If `domains` is empty the region is removed entirely.
/// Idempotent — calling twice with the same input leaves the file unchanged.
pub fn apply_blocks(domains: &[String]) -> AppResult<()> {
    apply_blocks_at(&os_hosts_path(), domains)
}

/// Remove FlowShield's managed region without touching anything else.
pub fn clear_blocks() -> AppResult<()> {
    apply_blocks_at(&os_hosts_path(), &[])
}

/// Non-elevated check: is the FlowShield-managed region currently in the
/// hosts file? Anyone can read `/etc/hosts`, so this works without a
/// password prompt — useful for crash-recovery sync on app launch and
/// keeping the dashboard's "blocking" indicator honest after restarts.
pub fn is_active() -> AppResult<bool> {
    let contents = fs::read_to_string(os_hosts_path())
        .map_err(|e| AppError::Storage(format!("read hosts: {e}")))?;
    Ok(contents.contains(BEGIN_MARKER))
}

/// Expand the user's `primaryDistractions` list (which the web stores as
/// category names like "Social Media", not real domains) into the actual
/// domains to feed into the hosts file.
///
/// Accepts both forms:
///   - **New title-case** ("Social Media", "Video Streaming", …) — the
///     current onboarding + profile UI shape.
///   - **Legacy lowercase** ("social-media", "youtube", "noise", …) —
///     written by an older onboarding flow; matches the mapping in
///     web-app/src/app/api/migrate-distractions/route.ts.
///   - **Already a domain** (anything containing a `.`) — passed through
///     so a future "add custom domain" UI works without a code change.
///   - **Anything else** — silently dropped (e.g. legacy 'games' has no
///     v2 mapping; better than writing `127.0.0.1 games` to hosts).
///
/// Output is sorted + deduped via BTreeSet so the hosts region is stable
/// across runs (no spurious diffs when the input order shifts).
pub fn expand_categories(input: &[String]) -> Vec<String> {
    let mut out: BTreeSet<String> = BTreeSet::new();
    for raw in input {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(canonical) = normalize_category(trimmed) {
            for d in category_domains(canonical) {
                out.insert((*d).to_string());
            }
        } else if trimmed.contains('.') {
            // Looks like a domain (has a dot) — pass through. apply_blocks
            // will further normalize (strip scheme, auto-add www variant).
            out.insert(trimmed.to_string());
        }
    }
    out.into_iter().collect()
}

/// Map a `primaryDistractions` value to its canonical category name so we
/// can look up domains. Mirrors the mapping in
/// `web-app/src/app/api/migrate-distractions/route.ts` so old + new values
/// resolve identically.
fn normalize_category(input: &str) -> Option<&'static str> {
    match input {
        "Social Media" | "social-media" | "social_media" | "noise" | "multitasking" => {
            Some("Social Media")
        }
        "Video Streaming" | "video-streaming" | "video_streaming" | "youtube" => {
            Some("Video Streaming")
        }
        "Email" | "email" => Some("Email"),
        "Messaging" | "messaging" | "notifications" | "meetings" => Some("Messaging"),
        "News Sites" | "news" | "news-sites" | "news_sites" => Some("News Sites"),
        "Shopping" | "shopping" => Some("Shopping"),
        _ => None,
    }
}

/// Domains for each canonical category. Mirrors the v2 .NET client's
/// `WebsiteBlocker._distractionDomains` (desktop-app/Services/WebsiteBlocker.cs:21).
/// We omit `www.` variants because `apply_blocks` already auto-adds them;
/// non-`www.` subdomains (m.facebook.com, web.whatsapp.com, …) stay as-is.
fn category_domains(category: &str) -> &'static [&'static str] {
    match category {
        "Social Media" => &[
            "facebook.com",
            "m.facebook.com",
            "twitter.com",
            "x.com",
            "instagram.com",
            "linkedin.com",
            "reddit.com",
            "tiktok.com",
            "snapchat.com",
            "pinterest.com",
        ],
        "Video Streaming" => &[
            "youtube.com",
            "m.youtube.com",
            "netflix.com",
            "hulu.com",
            "twitch.tv",
            "vimeo.com",
        ],
        "Email" => &[
            "gmail.com",
            "mail.google.com",
            "outlook.com",
            "outlook.live.com",
            "yahoo.com",
            "mail.yahoo.com",
            "protonmail.com",
            "mail.protonmail.com",
        ],
        "Messaging" => &[
            "messenger.com",
            "web.whatsapp.com",
            "web.telegram.org",
            "discord.com",
            "slack.com",
            "app.slack.com",
        ],
        "News Sites" => &[
            "news.google.com",
            "cnn.com",
            "bbc.com",
            "reddit.com",
            "buzzfeed.com",
        ],
        "Shopping" => &[
            "amazon.com",
            "ebay.com",
            "aliexpress.com",
            "walmart.com",
            "target.com",
        ],
        _ => &[],
    }
}

fn apply_blocks_at(path: &Path, domains: &[String]) -> AppResult<()> {
    let current =
        fs::read_to_string(path).map_err(|e| AppError::Storage(format!("read hosts: {e}")))?;

    // One-time backup of the user's pristine hosts file. We never overwrite
    // an existing backup, so the FIRST untouched copy is preserved across
    // any number of toggles.
    let backup = backup_path(path);
    if !backup.exists() {
        fs::copy(path, &backup)
            .map_err(|e| AppError::Storage(format!("backup hosts: {e}")))?;
    }

    let updated = rewrite(&current, domains);
    if updated == current {
        return Ok(());
    }

    let tmp = path.with_extension(format!("flowshield-tmp-{}", std::process::id()));
    fs::write(&tmp, &updated)
        .map_err(|e| AppError::Storage(format!("write tmp hosts: {e}")))?;
    fs::rename(&tmp, path).map_err(|e| AppError::Storage(format!("rename hosts: {e}")))?;
    Ok(())
}

fn backup_path(path: &Path) -> PathBuf {
    let mut p = path.as_os_str().to_owned();
    p.push(".");
    p.push(BACKUP_SUFFIX);
    PathBuf::from(p)
}

/// Pure string transform: strip any existing managed region from `current`,
/// then append a fresh region for `domains`. Split out from `apply_blocks_at`
/// so it's trivially testable without touching the FS.
fn rewrite(current: &str, domains: &[String]) -> String {
    let stripped = strip_region(current);
    let mut out = stripped.trim_end().to_string();
    if domains.is_empty() {
        out.push('\n');
        return out;
    }
    out.push_str("\n\n");
    out.push_str(BEGIN_MARKER);
    out.push('\n');
    for d in domains {
        let domain = d
            .trim()
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        if domain.is_empty() {
            continue;
        }
        out.push_str(&format!("127.0.0.1 {domain}\n"));
        if !domain.starts_with("www.") {
            out.push_str(&format!("127.0.0.1 www.{domain}\n"));
        }
    }
    out.push_str(END_MARKER);
    out.push('\n');
    out
}

fn strip_region(input: &str) -> String {
    let Some(begin) = input.find(BEGIN_MARKER) else {
        return input.to_string();
    };
    let Some(end_off) = input[begin..].find(END_MARKER) else {
        return input.to_string();
    };
    let end = begin + end_off + END_MARKER.len();
    // Also consume one trailing newline so we don't accumulate blank lines
    // across repeated apply/clear cycles.
    let cut_end = if input[end..].starts_with('\n') {
        end + 1
    } else {
        end
    };
    let mut out = String::with_capacity(input.len());
    out.push_str(&input[..begin]);
    out.push_str(&input[cut_end..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_hosts(initial: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = env::temp_dir().join(format!(
            "flowshield-blocking-test-{}-{n}.hosts",
            std::process::id()
        ));
        fs::write(&path, initial).unwrap();
        path
    }

    #[test]
    fn rewrite_adds_region_when_absent() {
        let out = rewrite("127.0.0.1 localhost\n", &["youtube.com".into()]);
        assert!(out.contains(BEGIN_MARKER));
        assert!(out.contains("127.0.0.1 youtube.com\n"));
        assert!(out.contains("127.0.0.1 www.youtube.com\n"));
        assert!(out.contains(END_MARKER));
    }

    #[test]
    fn rewrite_replaces_existing_region() {
        let first = rewrite("127.0.0.1 localhost\n", &["youtube.com".into()]);
        let second = rewrite(&first, &["reddit.com".into()]);
        assert!(!second.contains("youtube.com"));
        assert!(second.contains("127.0.0.1 reddit.com\n"));
        assert_eq!(second.matches(BEGIN_MARKER).count(), 1);
    }

    #[test]
    fn rewrite_with_empty_domains_removes_region() {
        let with_blocks = rewrite("127.0.0.1 localhost\n", &["youtube.com".into()]);
        let cleared = rewrite(&with_blocks, &[]);
        assert!(!cleared.contains(BEGIN_MARKER));
        assert!(!cleared.contains("youtube.com"));
        assert!(cleared.contains("127.0.0.1 localhost"));
    }

    #[test]
    fn rewrite_strips_url_scheme() {
        let out = rewrite("", &["https://reddit.com".into(), "http://x.com".into()]);
        assert!(out.contains("127.0.0.1 reddit.com\n"));
        assert!(out.contains("127.0.0.1 x.com\n"));
        assert!(!out.contains("https://"));
    }

    #[test]
    fn rewrite_skips_www_doubling_when_already_prefixed() {
        let out = rewrite("", &["www.youtube.com".into()]);
        assert!(out.contains("127.0.0.1 www.youtube.com\n"));
        assert!(!out.contains("www.www."));
    }

    #[test]
    fn expand_categories_handles_new_titlecase() {
        let out = expand_categories(&["Social Media".into()]);
        assert!(out.contains(&"facebook.com".to_string()));
        assert!(out.contains(&"reddit.com".to_string()));
        assert!(out.contains(&"x.com".to_string()));
        // Video Streaming is a different category — must not appear.
        assert!(!out.contains(&"youtube.com".to_string()));
    }

    #[test]
    fn expand_categories_handles_legacy_lowercase() {
        let out = expand_categories(&["social-media".into(), "youtube".into()]);
        // "social-media" → Social Media domains
        assert!(out.contains(&"facebook.com".to_string()));
        // "youtube" (legacy) → Video Streaming domains
        assert!(out.contains(&"youtube.com".to_string()));
        assert!(out.contains(&"netflix.com".to_string()));
    }

    #[test]
    fn expand_categories_passes_through_real_domains() {
        let out = expand_categories(&["custom.example.com".into(), "Social Media".into()]);
        assert!(out.contains(&"custom.example.com".to_string()));
        assert!(out.contains(&"facebook.com".to_string()));
    }

    #[test]
    fn expand_categories_drops_unknown_non_domain() {
        // 'games' has no v2 mapping and isn't a domain → silently dropped.
        let out = expand_categories(&["games".into(), "Social Media".into()]);
        assert!(!out.iter().any(|d| d == "games"));
        assert!(out.contains(&"facebook.com".to_string()));
    }

    #[test]
    fn expand_categories_dedupes_overlapping_categories() {
        // Both "Social Media" and "News Sites" include reddit.com — should
        // appear exactly once in the output.
        let out = expand_categories(&["Social Media".into(), "News Sites".into()]);
        let reddit_count = out.iter().filter(|d| *d == "reddit.com").count();
        assert_eq!(reddit_count, 1);
    }

    #[test]
    fn expand_categories_skips_empty_and_whitespace() {
        let out = expand_categories(&["".into(), "   ".into(), "Social Media".into()]);
        assert!(!out.is_empty());
        assert!(out.contains(&"facebook.com".to_string()));
    }

    #[test]
    fn expand_categories_handles_legacy_aliases_from_migrate_route() {
        // From web-app/src/app/api/migrate-distractions/route.ts:
        // 'noise' and 'multitasking' map to Social Media.
        // 'notifications' and 'meetings' map to Messaging.
        let social = expand_categories(&["noise".into()]);
        assert!(social.contains(&"facebook.com".to_string()));
        let msg = expand_categories(&["meetings".into()]);
        assert!(msg.contains(&"discord.com".to_string()));
    }

    #[test]
    fn apply_blocks_at_creates_backup_once() {
        let path = temp_hosts("127.0.0.1 localhost\n");
        apply_blocks_at(&path, &["youtube.com".into()]).unwrap();
        let backup = backup_path(&path);
        assert!(backup.exists());
        let backup_contents = fs::read_to_string(&backup).unwrap();
        assert_eq!(backup_contents, "127.0.0.1 localhost\n");

        // A second apply must NOT overwrite the backup.
        apply_blocks_at(&path, &["reddit.com".into()]).unwrap();
        let backup_contents_2 = fs::read_to_string(&backup).unwrap();
        assert_eq!(backup_contents_2, "127.0.0.1 localhost\n");

        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&backup);
    }

    #[test]
    fn apply_then_clear_returns_to_original_content() {
        let original = "127.0.0.1 localhost\n255.255.255.255 broadcasthost\n";
        let path = temp_hosts(original);
        apply_blocks_at(&path, &["youtube.com".into()]).unwrap();
        apply_blocks_at(&path, &[]).unwrap();
        let after = fs::read_to_string(&path).unwrap();
        assert_eq!(after.trim_end(), original.trim_end());

        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&backup_path(&path));
    }
}
