# FlowShield Desktop — v3.0.0 (Polish & Release)

This is the final sprint in the Desktop v2.x → v3.0 roadmap. It brings a polished session experience, full parity with the web dashboard, and comprehensive test coverage across all major services.

---

## What's New in v3.0.0

### Session Type Picker
The "Start Focus Session" tray menu now lets you choose your session type before you begin:

- **💼 Work** — 25, 45, or 60 minutes
- **📚 Study** — 25, 45, or 90 minutes
- **🎨 Creative** — 45, 90, or 120 minutes

Session type is synced to the server and shown on the web dashboard analytics page.

### Session Type Badge in Widget
The floating timer widget now displays the active session type as a badge below the timer while a session is running. Paused sessions show an amber "Paused" status.

---

## What's New in v2.9.0 (Sprint 19 — Desktop-Unique Features)

### Custom App Blocking
You can now define your own list of apps to block during focus sessions — right from the Settings dialog. Enter one process name per line (no `.exe`). These are merged with your web-configured distraction preferences.

### Session History Window
A new **Session History** window (accessible from the tray menu) shows your last 30 sessions with date, session type, planned duration, actual duration, and status badge (Done / Paused / Active / Stopped).

---

## What's New in v2.8.0 (Sprint 18 — Teams & Real-Time)

### Pusher Real-Time Sync
The desktop app now connects to Pusher on login and receives instant `session-update` events. Pause, resume, and stop actions from the web dashboard or mobile app are reflected on the desktop within milliseconds — no more waiting for the 30-second poll.

### Teams
A new **👥 My Teams** window lets you create a team, join one with an invite code, and view your current team memberships directly from the desktop.

---

## What's New in v2.7.0 (Sprint 17 — AI Coach & Leaderboard)

### AI Coach
The **✨ AI Coach** window streams personalized focus advice powered by Claude Opus 4.6. The coach uses your recent activity data to give context-aware suggestions for improving your productivity.

### Leaderboard
The **🏆 Leaderboard** window shows how you rank against your team or global users across daily, weekly, and monthly periods.

---

## What's New in v2.6.0 (Sprint 16 — Goals, Projects & Preferences Sync)

### Goals & Projects
Two new windows for managing your **Goals** and **Projects** — the same data shown on the web dashboard, now accessible without leaving your desktop.

### Preferences Sync
Session preferences (preferred duration, work style, break reminders, sound) are now loaded from and saved to the server in the Settings dialog, keeping web and desktop in sync.

---

## What's New in v2.5.0 (Sprint 15 — Desktop Analytics Dashboard)

### Analytics Window
A new **Analytics** window shows today's focus time, top applications, category breakdown, and productivity trends — bringing the web dashboard data to the desktop without opening a browser.

---

## What's New in v2.4.0 (Sprint 14 — Session Pause/Resume)

### Pause & Resume
Focus sessions can now be paused from the tray menu (or from the web/mobile) and resumed later. The server shifts the session's end time forward to account for the break, so your full planned duration is always preserved.

The pause/resume state syncs instantly across all devices.

---

## Upgrade Notes

- No data migration required — update in place
- Settings and activity history are preserved
- Custom blocked apps added in v2.9.0 are stored locally in SQLite

## Download

The installer is attached below. Run `FlowShield-Setup-v3.0.0.exe` and follow the prompts.
