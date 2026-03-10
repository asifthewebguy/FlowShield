# FlowShield Desktop — v2.2.0 (Resilience & Safety)

## What's New

### Crash-Safe Website Blocking
- The hosts file is now **backed up** (`%LOCALAPPDATA%\FlowShield\hosts.backup`) before every blocking operation
- On startup FlowShield **automatically detects and removes** stale blocking entries left behind by a previous crash — your internet access is never permanently disrupted

### Exponential Backoff for Sync Retries
- When cloud sync fails, the retry interval now backs off exponentially: 5 min → 10 min → 20 min → capped at 30 min
- The interval **resets to 5 minutes** automatically after a successful sync

### Offline Queue Resilience
- Pending offline operations are now **bounded to 500 entries maximum** — the oldest are trimmed automatically
- Operations older than **7 days** are purged on every queue write to prevent unbounded growth

### Graceful Shutdown
- `ProcessExit` and `CancelKeyPress` handlers now ensure hosts file cleanup runs even on sudden termination
- On normal exit, any pending activity data is **flushed to the server** before the process ends
- Fixed a double-dispose of the tray icon that could cause noisy errors in logs

### Improved Error Observability
- All bare `catch {}` blocks replaced with `Log.Warning(ex, ...)` — every swallowed error now appears in the log file at `%LOCALAPPDATA%\FlowShield\logs\`
- Sync replay failures, DNS flush errors, and preference-load failures all now emit structured warnings

## Quality
- **84 unit tests** (up from 64) — new test suites for backoff math, queue bounding, and hosts file resilience

## Upgrade Notes
- No database migration required — upgrade in place by running the installer
- If you had website blocking active before upgrading, FlowShield will detect and cleanly restore the hosts file on first launch

## Download
The installer and portable zip are attached below.
