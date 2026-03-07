# FlowShield Browser Extension

Chrome extension (Manifest V3) that tracks browser tab activity and shows your active focus session timer.

## Features

- **Session timer** in popup — live countdown for your active FlowShield session
- **Badge** on toolbar icon showing remaining session time
- **Tab tracking** — records time spent on each domain and syncs to FlowShield
- **Distraction detection** — highlights sites from your primaryDistractions list in red
- **Activity sync** — sends browser activity to `/api/activity/sync` with `source: "browser"`

## Installation (Development)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this `browser-extension/` folder
4. Add icon PNG files to `icons/` (see below) if not already present

## Icons Required

Place the following PNG files in `icons/`:
- `icon16.png`  — 16×16 px
- `icon48.png`  — 48×48 px
- `icon128.png` — 128×128 px

Use the FlowShield lightning bolt logo with a dark (#0f172a) background.

## How It Works

### Background Service Worker (`background.js`)
- Listens to `chrome.tabs.onActivated` and `chrome.webNavigation.onCompleted`
- Tracks time spent on each domain in memory
- Every 1 minute: flushes buffered logs → `POST /api/activity/sync`
- Every 30 seconds: polls `/api/sessions?date=today` for active session state
- Updates the toolbar badge with remaining session time
- Flags distraction domains in red (from user's `primaryDistractions` preference)

### Popup (`popup/`)
- Shows sign-in form if not logged in (calls `/api/auth/login`)
- Displays active session with animated ring timer
- Shows current tab domain and distraction warning
- "Sync Activity Now" button for manual flush
- Links to Dashboard, Analytics, Settings

## API Communication

All requests go to `https://flowshield.app`:
- `POST /api/auth/login` — authenticate
- `GET /api/sessions?date=YYYY-MM-DD` — get active session
- `POST /api/activity/sync` — send tab activity (body: `{ source: "browser", activities: [...] }`)
- `GET /api/user/preferences` — load distraction list

Token stored in `chrome.storage.local` as `token`.
