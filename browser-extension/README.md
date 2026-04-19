# FlowShield Browser Extension

Chrome (Manifest V3) and Firefox (Manifest V2) extensions that track browser tab activity and show your active focus session timer.

## Structure

```
browser-extension/
├── chrome/    — Chrome MV3 extension
├── firefox/   — Firefox MV2 extension
├── icons/     — Source SVG (icon.svg) for regenerating PNGs
├── build.js   — Build script (produces store-ready zips)
└── package.json
```

## Build (store-ready packages)

```bash
cd browser-extension
npm install          # first time only
npm run build        # builds both → dist/
npm run build:chrome # Chrome only
npm run build:firefox# Firefox only
```

Output:
- `dist/flowshield-chrome-<version>.zip` — upload to Chrome Web Store Developer Dashboard
- `dist/flowshield-firefox-<version>.zip` — upload to Firefox AMO (addons.mozilla.org)

## Load in Browser (Development)

**Chrome:** `chrome://extensions` → Developer mode ON → Load unpacked → select `browser-extension/chrome/`

**Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → select `browser-extension/firefox/manifest.json`

## Features

- **Session timer** in popup — live countdown for your active FlowShield session
- **Badge** on toolbar icon showing remaining session time
- **Tab tracking** — records time spent on each domain and syncs to FlowShield
- **Distraction detection** — highlights sites from your primaryDistractions list in red
- **Activity sync** — sends browser activity to `/api/activity/sync` with `source: "browser"`

## Icons

Generate PNGs from `icons/icon.svg` at 16px, 48px, 128px and copy into both `chrome/icons/` and `firefox/icons/`.
