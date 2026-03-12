# FlowShield Desktop — v2.2.1 (Timer Sync Hotfix)

## Bug Fixes

### Timers Now Stay in Sync Across All Devices
All three surfaces (web app, desktop, browser extension) previously maintained independent local countdowns that drifted apart over time. A session started on the web would show different remaining times on each device.

**Root causes fixed:**

- **Desktop**: The countdown timer started counting from the requested duration *before* the API call returned, ignoring the server's authoritative `startTime`. Over a 25-minute session this could accumulate over a minute of drift. The timer now calculates `plannedEnd - DateTime.UtcNow` on every tick using the server's `startTime`.
- **Web**: The `setInterval` decremented `prev - 1` locally and only re-anchored every 30 seconds (SWR/Pusher). It now recalculates from `session.startTime` on every tick.
- **Extension**: The popup opened using a 30-second stale cache. It now forces a fresh API fetch before rendering the timer.

### Desktop Detects Sessions Started on Web/Mobile
Previously, if a focus session was started on the web app or mobile app, the desktop would show "25:00 / Start Session" until it was restarted. The desktop now polls the server every 30 seconds in the background and automatically picks up active sessions started on any device — no restart required.

## Upgrade Notes
- No database migration required
- Update by running the installer over the existing installation

## Download
The installer and portable zip are attached below.
