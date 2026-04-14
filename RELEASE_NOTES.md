# FlowShield Desktop — v3.0.7

## What's New in v3.0.7

### Features
- **Project selector in widget** — The session widget now shows a project dropdown above the Start button. Your projects load automatically when the widget opens. Select a project before starting a session and it will be linked to that session on the web dashboard.

---

# FlowShield Desktop — v3.0.6

## What's New in v3.0.6

### Bug Fixes
- **Fixed: Can't type in Projects and other windows** — WPF windows opened from the WinForms tray host were not receiving keyboard character messages (`WM_CHAR`). Pasting via Ctrl+V worked but direct typing did not. Fixed by enabling modeless keyboard interop (`ElementHost.EnableModelessKeyboardInterop`) for all WPF windows before they are shown. Affects Projects, Goals, Teams, Analytics, Session History, Leaderboard, and the widget.

---

# FlowShield Desktop — v3.0.5

## What's New in v3.0.5

### Changes
- **Removed AI Coach from tray menu** — AI Coach will return in a future update.

---

# FlowShield Desktop — v3.0.4

## What's New in v3.0.4

### Bug Fixes
- **Fixed: Exit menu item does nothing** — Clicking Exit was deadlocking: the sync flush on exit called an async method synchronously on the UI thread, which blocked forever waiting for itself. The flush now runs on a background thread with a 5-second timeout, so Exit always works.

---

# FlowShield Desktop — v3.0.3

## What's New in v3.0.3

### Bug Fixes
- **Fixed: Can't type in AI Coach and other windows** — All WPF windows (AI Coach, Analytics, Goals, Projects, Teams, Leaderboard, Session History, Main Widget) had `AllowsTransparency=True` which triggers a Windows API restriction that silently blocks keyboard input to text fields. All windows now use a solid background instead.
- **Feature menu items now prompt sign-in** — Clicking any feature in the tray menu (Show Widget, Analytics, Goals, AI Coach, etc.) when not logged in now opens the sign-in dialog instead of silently failing.

---

# FlowShield Desktop — v3.0.2

## What's New in v3.0.2

### Bug Fixes
- **Fixed: App appeared frozen on launch (Microsoft Store certification fix)** — The always-on-top splash screen was blocking the login form on first run, making the app appear unresponsive. Splash now closes before any dialog is shown.
- **Fixed: Infinite login dialog loop** — Cancelling the login dialog no longer re-opens it recursively. The app now stays in the system tray and lets you sign in later via right-click → Sign In.

---

# FlowShield Desktop — v3.0.1

## What's New in v3.0.1

### Splash Screen
A branded splash screen now appears on startup while services initialise — showing the FlowShield logo, tagline, and animated status dots. Closes automatically when the app is ready.

### Microsoft Store (MSIX) Support
- MSIX packaging project added for Microsoft Store submission
- App no longer requires administrator elevation at launch when installed from the Store
- Website blocking gracefully reports "not available in Store edition" instead of failing
- Auto-start managed via Windows Settings when installed as MSIX

### Store Assets
Updated Store listing artwork with final FlowShield branding.

---

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
