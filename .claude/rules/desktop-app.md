---
description: LEGACY .NET 8 Windows desktop app — superseded by desktop-app-v3. Stack, services, SQLite schema
globs: desktop-app/**
alwaysApply: false
---

# Desktop App — LEGACY (`desktop-app/`)

> **Superseded by [`desktop-app-v3`](desktop-app-v3.md)** (Tauri 2 + React, v3.11.1-alpha.0),
> which is the client that actually ships. This .NET app is kept for reference and
> still receives cross-client changes (e.g. token revocation), but is not released.
>
> `desktop-release.yml` triggers on `v[0-2].*` tags only, while this project's
> `<Version>` is `3.0.8` — so that workflow can no longer cut a release for it.
> `v3.*` tags go to `desktop-v3-release.yml`.

## Stack

- **.NET 8.0**, WinForms + WPF (hybrid), C#, `nullable enable`
- **DB:** SQLite encrypted with SQLCipher (`SQLitePCLRaw.bundle_e_sqlcipher`)
- **Key protection:** DPAPI via `KeyProtectionService`
- **Logging:** Serilog → `%LOCALAPPDATA%\FlowShield\logs\` (7-day rolling)
- **Error tracking:** Sentry .NET v4.14.0 — DSN in `appsettings.json` or `FLOWSHIELD_SENTRY_DSN` env var
- **Installer:** Inno Setup (`FlowShield-Setup.iss`) → `FlowShield-Setup-v{version}.exe`
- **Version in `FlowShield.Desktop.csproj`:** 3.0.8 (unreleasable — see banner above)

## Key Services

| File | Responsibility |
|------|---------------|
| `Services/ActivityTracker.cs` | Window/process monitoring; delegates categorization to `CategoryService` |
| `Services/CategoryService.cs` | Fetches rules from `/api/categories`; caches in SQLite `CategoryRules`; refreshes every 24h; `NormalizeCategory()` |
| `Services/SessionManager.cs` | Timer anchored to server `startTime`; 30s `_reSyncTimer` for cross-device session detection |
| `Services/SyncService.cs` | Offline queue replay; exponential backoff `min(5min × 2^n, 30min)`; network-change reconnect |
| `Services/DatabaseService.cs` | SQLite CRUD; auto-migration on startup |
| `Services/ApiClient.cs` | HTTP calls to web API; `SyncActivitiesAsync()` calls `NormalizeCategory()` |
| `Services/UpdateService.cs` | Checks GitHub Releases API 10s after startup; prompts user to download |
| `Services/BlockingService.cs` | Hosts file manipulation for deep work mode; backup before every change; crash recovery on startup |
| `Services/KeyProtectionService.cs` | DPAPI-based SQLCipher key management |
| `Services/AutoStartService.cs` | `HKCU\...\Run` registry key for Windows startup |
| `UI/TrayApplication.cs` | System tray entry point; wires all services together |

## SQLite Tables

`Sessions` · `ActivityLogs` · `PendingOperations` (bounded 500 entries, 7-day TTL purge) · `CategoryRules`

`PendingOperations` columns: `Id`, `OperationType` (START_SESSION/END_SESSION), `Payload`, `CreatedAt`, `RetryCount`

## `ActivityCategory` Enum Values

`Unknown=0` · `Productivity=1` · `Entertainment=2` · `Social=3` · `Communication=4` · `Development=5` · `Browsing=6` · `Work=7` · `Creative=8` · `Study=9`

## Unit Tests

- Project: `desktop-app/FlowShield.Desktop.Tests/` (xUnit)
- **177 `[Fact]`/`[Theory]` attributes across 12 files**: categorization, version compare, activity levels, DB CRUD, blocking, backoff, queue bounds, hosts-file resilience, `CategoryService` rule matching + normalization
- Run: `cd desktop-app && dotnet test` — **Windows only.** Compiles on Linux with
  `-p:EnableWindowsTargeting=true` but will not run there.

## CI/CD

- **Workflow:** `.github/workflows/desktop-release.yml` — triggers on `v[0-2].*` tags
  (plus `workflow_dispatch`). Since this project is at `3.0.8`, no tag it accepts
  matches the code any more — treat this pipeline as dormant.
- Steps: checkout → `dotnet test` → `dotnet publish` (self-contained, win-x64) → Inno Setup → create GitHub Release
- Release asset: `FlowShield-Setup-vX.Y.Z.exe`
- **Code signing:** Not yet implemented. Windows Smart App Control blocks unsigned installer.
  - Plan: integrate **SignPath Foundation** (free for OSS projects at signpath.io/foundation)
  - Pending: add two signing steps to `desktop-release.yml` (after publish, after Inno Setup)

## Release Process (dormant)

Kept for reference only. New desktop releases go through release-please on
`desktop-app-v3` — see [`desktop-app-v3`](desktop-app-v3.md).

```bash
# 1. Bump version in both files:
#    desktop-app/FlowShield.Desktop.csproj  → <Version>X.Y.Z</Version>
#    desktop-app/FlowShield-Setup.iss       → #define AppVersion "X.Y.Z"
# 2. Update RELEASE_NOTES.md
# 3. Commit and tag:
git tag vX.Y.Z
git push origin vX.Y.Z   # triggers desktop-release.yml → GitHub Release
```
