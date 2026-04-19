# Browser Extension (`browser-extension/`)

## Structure

```
browser-extension/
├── chrome/    — Chrome MV3 (fully independent)
├── firefox/   — Firefox MV2 (fully independent)
├── icons/     — Source SVG only (not packaged)
├── build.js   — Zips chrome/ or firefox/ into dist/
└── package.json
```

## Manifests

- **Chrome:** Manifest V3 — `browser-extension/chrome/manifest.json`
- **Firefox:** Manifest V2 — `browser-extension/firefox/manifest.json`
  - Uses `browser_action`, `background.scripts`, `browser_specific_settings.gecko`, min Firefox 91
  - `chrome.browserAction` instead of `chrome.action` in background.js

## Key Files (per browser)

| File | Purpose |
|------|---------|
| `background.js` | Service worker (Chrome) / background script (Firefox) — tab change tracking, 1-min activity sync alarm, 30s session poll alarm, `FORCE_POLL_SESSION` handler |
| `popup/popup.js` | Popup logic — calls `FORCE_POLL_SESSION` before `refreshState()` to get fresh session data |
| `popup/popup.html` | Popup UI — animated ring timer, session info, login form, distraction banner |

## Key Behaviors

- **Toolbar badge:** Shows remaining session minutes; turns orange < 20% remaining; red on distraction sites
- **Distraction detection:** Checks current domain against `user.preferences.primaryDistractions`
- **`FORCE_POLL_SESSION`:** Message from popup → background; forces immediate `fetchActiveSession()` call so popup never shows stale timer data from 30s-old poll

## MV2 vs MV3 Differences (Firefox vs Chrome)

| Feature | Chrome (MV3) | Firefox (MV2) |
|---------|-------------|---------------|
| Background | `service_worker` | `scripts` + `persistent: false` |
| Toolbar API | `chrome.action` | `chrome.browserAction` |
| Manifest key | `action` | `browser_action` |
| CSP format | Object | String |
| Host perms | `host_permissions` | Inside `permissions` |

## Build

```bash
cd browser-extension
npm install
npm run build          # → dist/flowshield-chrome-1.0.0.zip + dist/flowshield-firefox-1.0.0.zip
```

## Load in Browser (Development)

**Chrome:** `chrome://extensions` → Developer mode ON → Load unpacked → select `browser-extension/chrome/`

**Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → select `browser-extension/firefox/manifest.json`
