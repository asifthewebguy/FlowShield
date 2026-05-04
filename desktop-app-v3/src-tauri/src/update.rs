//! In-app update notifications.
//!
//! Polls the GitHub Releases API on a schedule, compares the latest v3.*
//! release to the running binary's version, and emits an `update-available`
//! Tauri event when a newer release exists.
//!
//! The notification's UX intensity depends on how the app was installed —
//! AUR / Flatpak / Snap / Homebrew users get a quiet tray menu badge that
//! points them at the right `yay -Syu` / `flatpak update` flow, while users
//! who downloaded the .AppImage / .deb / .rpm / .dmg directly get a loud
//! in-app banner with a Download button. Dev builds get nothing.

use semver::Version;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const RELEASES_API_URL: &str =
    "https://api.github.com/repos/asifthewebguy/FlowShield/releases?per_page=20";

/// Our PKGBUILD installs the wrapped AppImage to /opt/flowshield-bin/. AUR
/// users can be distinguished from direct-AppImage users by checking whether
/// $APPIMAGE points into this prefix.
const AUR_INSTALL_PATH_PREFIX: &str = "/opt/flowshield-bin/";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallSource {
    Aur,
    AppImageDirect,
    /// .deb or .rpm — direct download from a GitHub Release. We don't try
    /// to distinguish them (dpkg -S vs rpm -qf is heavy + same UX anyway).
    LinuxPackage,
    DmgDirect,
    Flatpak,
    Snap,
    Homebrew,
    Dev,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptStyle {
    /// Banner + tray menu item — direct downloads with no auto-update.
    Loud,
    /// Tray menu item only — let the package manager handle updates.
    Quiet,
    /// Suppress entirely (dev builds, unknown sources).
    None,
}

impl InstallSource {
    pub fn prompt_style(self) -> PromptStyle {
        match self {
            InstallSource::Aur
            | InstallSource::Flatpak
            | InstallSource::Snap
            | InstallSource::Homebrew => PromptStyle::Quiet,
            InstallSource::AppImageDirect
            | InstallSource::LinuxPackage
            | InstallSource::DmgDirect => PromptStyle::Loud,
            InstallSource::Dev | InstallSource::Unknown => PromptStyle::None,
        }
    }

    /// URL the user is sent to for updating, given the new tag. PM channels
    /// open their package page (so the user can verify + run their helper);
    /// direct downloads open the GitHub Release page (where the assets live).
    pub fn update_url(self, latest_tag: &str) -> String {
        match self {
            InstallSource::Aur => {
                "https://aur.archlinux.org/packages/flowshield-bin".to_string()
            }
            InstallSource::Flatpak => {
                "https://flathub.org/apps/app.flowshield.desktop".to_string()
            }
            InstallSource::Snap => "https://snapcraft.io/flowshield".to_string(),
            InstallSource::Homebrew => {
                "https://github.com/asifthewebguy/FlowShield#install".to_string()
            }
            _ => format!(
                "https://github.com/asifthewebguy/FlowShield/releases/tag/{latest_tag}"
            ),
        }
    }
}

/// Decide which install channel the running binary came from. Cheap (env
/// var lookups + path prefix check); safe to call on every update tick.
pub fn detect_install_source() -> InstallSource {
    if cfg!(debug_assertions) {
        return InstallSource::Dev;
    }
    // Sandbox runtimes set their own env vars and the binary lives inside
    // the sandbox FS — check these first because they take precedence over
    // the AppImage check (a Flatpak'd Tauri build still has $APPIMAGE unset
    // but a Snap-wrapped one might).
    if std::env::var_os("FLATPAK_ID").is_some() {
        return InstallSource::Flatpak;
    }
    if std::env::var_os("SNAP_NAME").is_some() {
        return InstallSource::Snap;
    }
    if let Some(appimage_path) = std::env::var_os("APPIMAGE") {
        let path = PathBuf::from(appimage_path);
        if path.starts_with(AUR_INSTALL_PATH_PREFIX) {
            return InstallSource::Aur;
        }
        return InstallSource::AppImageDirect;
    }

    let exe_path = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return InstallSource::Unknown,
    };
    let exe_str = exe_path.to_string_lossy();

    #[cfg(target_os = "macos")]
    {
        // Homebrew Cask installs the .app under /Applications/ but symlinks
        // the executable from /opt/homebrew/Caskroom/. Check Caskroom first
        // so a Homebrew install doesn't mis-detect as DmgDirect.
        if exe_str.contains("/Caskroom/") || exe_str.starts_with("/opt/homebrew/") {
            return InstallSource::Homebrew;
        }
        if exe_str.starts_with("/Applications/") {
            return InstallSource::DmgDirect;
        }
    }

    #[cfg(target_os = "linux")]
    {
        if exe_str.starts_with("/usr/bin/") || exe_str.starts_with("/usr/local/bin/") {
            return InstallSource::LinuxPackage;
        }
    }

    let _ = exe_str;
    InstallSource::Unknown
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub latest_tag: String,
    /// Channel-appropriate URL the click action opens.
    pub release_url: String,
    /// Always points at the GitHub Release page so users can read changelog
    /// even on PM channels.
    pub release_notes_url: String,
    pub source: InstallSource,
    pub prompt_style: PromptStyle,
    /// PM channels: the recommended one-liner (e.g. `yay -Syu flowshield-bin`).
    /// `None` for direct-download channels (no command to run).
    pub update_command: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    html_url: String,
    draft: bool,
}

async fn fetch_latest_v3_release(http: &reqwest::Client) -> Result<GhRelease, String> {
    let resp = http
        .get(RELEASES_API_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("github releases fetch: {e}"))?
        .error_for_status()
        .map_err(|e| format!("github releases status: {e}"))?;

    let releases: Vec<GhRelease> = resp
        .json()
        .await
        .map_err(|e| format!("github releases parse: {e}"))?;

    // Filter to v3.* tags (skipping drafts), then sort by semver descending.
    // GitHub's `releases/latest` excludes prereleases, which is wrong for us
    // since every shipping build is currently `-alpha.0`. Hence the manual
    // filter + sort over `releases?per_page=20`.
    let mut v3: Vec<GhRelease> = releases
        .into_iter()
        .filter(|r| !r.draft && r.tag_name.starts_with("v3."))
        .collect();

    v3.sort_by(|a, b| {
        let av = Version::parse(a.tag_name.trim_start_matches('v')).ok();
        let bv = Version::parse(b.tag_name.trim_start_matches('v')).ok();
        bv.cmp(&av)
    });

    v3.into_iter()
        .next()
        .ok_or_else(|| "no v3.* releases found".to_string())
}

/// Check the current binary's version against GitHub's latest v3.* release.
/// Returns `None` if up-to-date or if `prompt_style()` is `None` (dev /
/// unknown sources). Errors are logged but never bubbled — a flaky GitHub
/// API call should never break the app.
pub async fn check_for_updates(http: &reqwest::Client) -> Option<UpdateInfo> {
    let source = detect_install_source();
    if matches!(source.prompt_style(), PromptStyle::None) {
        tracing::debug!(?source, "update check skipped (suppressed source)");
        return None;
    }

    let current_str = env!("CARGO_PKG_VERSION");
    let current = match Version::parse(current_str) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(error = %e, version = current_str, "current version parse failed");
            return None;
        }
    };

    let release = match fetch_latest_v3_release(http).await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = %e, "fetch latest release failed");
            return None;
        }
    };

    let latest = match Version::parse(release.tag_name.trim_start_matches('v')) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(error = %e, tag = %release.tag_name, "latest version parse failed");
            return None;
        }
    };

    if latest <= current {
        tracing::debug!(%current, %latest, "already on latest");
        return None;
    }

    let update_command = match source {
        InstallSource::Aur => Some("yay -Syu flowshield-bin".to_string()),
        InstallSource::Flatpak => Some("flatpak update app.flowshield.desktop".to_string()),
        InstallSource::Snap => Some("sudo snap refresh flowshield".to_string()),
        InstallSource::Homebrew => Some("brew upgrade --cask flowshield".to_string()),
        _ => None,
    };

    tracing::info!(%current, %latest, ?source, "update available");

    Some(UpdateInfo {
        current_version: current.to_string(),
        latest_version: latest.to_string(),
        latest_tag: release.tag_name.clone(),
        release_url: source.update_url(&release.tag_name),
        release_notes_url: release.html_url,
        source,
        prompt_style: source.prompt_style(),
        update_command,
    })
}

/// Composite: check + (if found) announce via tray + emit `update-available`
/// Tauri event for the frontend banner. Both the periodic background task
/// and the manual `update_check_now` command go through this so the tray
/// menu and the in-app banner stay in sync regardless of trigger.
pub async fn check_and_publish(
    handle: &tauri::AppHandle,
    http: &reqwest::Client,
) -> Option<UpdateInfo> {
    use tauri::Emitter;
    let info = check_for_updates(http).await?;
    if let Err(e) = crate::tray::announce_update(handle, &info) {
        tracing::warn!(error = %e, "tray announce_update failed");
    }
    if let Err(e) = handle.emit("update-available", &info) {
        tracing::warn!(error = %e, "emit update-available failed");
    }
    Some(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_suppresses_prompt() {
        // Test binary always runs with debug_assertions enabled.
        assert_eq!(detect_install_source(), InstallSource::Dev);
        assert!(matches!(
            InstallSource::Dev.prompt_style(),
            PromptStyle::None
        ));
    }

    #[test]
    fn aur_url_points_at_aur_package_page() {
        assert_eq!(
            InstallSource::Aur.update_url("v3.4.0"),
            "https://aur.archlinux.org/packages/flowshield-bin"
        );
    }

    #[test]
    fn direct_url_points_at_github_release() {
        assert_eq!(
            InstallSource::AppImageDirect.update_url("v3.4.0"),
            "https://github.com/asifthewebguy/FlowShield/releases/tag/v3.4.0"
        );
    }

    #[test]
    fn package_manager_sources_get_quiet_style() {
        for s in [
            InstallSource::Aur,
            InstallSource::Flatpak,
            InstallSource::Snap,
            InstallSource::Homebrew,
        ] {
            assert!(matches!(s.prompt_style(), PromptStyle::Quiet), "{s:?}");
        }
    }

    #[test]
    fn direct_download_sources_get_loud_style() {
        for s in [
            InstallSource::AppImageDirect,
            InstallSource::LinuxPackage,
            InstallSource::DmgDirect,
        ] {
            assert!(matches!(s.prompt_style(), PromptStyle::Loud), "{s:?}");
        }
    }
}
