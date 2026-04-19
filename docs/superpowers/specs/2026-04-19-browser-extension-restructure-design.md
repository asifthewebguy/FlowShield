# Browser Extension Restructure — Design Spec

**Date:** 2026-04-19
**Status:** Approved

## Goal

Reorganize the browser extension into two fully independent, store-submittable packages:
- `browser-extension/chrome/` — Chrome MV3
- `browser-extension/firefox/` — Firefox MV2

Add a `package.json` + `build.js` at `browser-extension/` that zips each into a distributable file ready for Chrome Web Store and Firefox AMO upload.

## Directory Structure

```
browser-extension/
├── chrome/
│   ├── manifest.json          # MV3
│   ├── background.js
│   ├── content.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── firefox/
│   ├── manifest.json          # MV2
│   ├── background.js          # chrome.browserAction instead of chrome.action
│   ├── content.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── icons/                     # source SVG only — not packaged
│   └── icon.svg
├── package.json
├── build.js
└── README.md
```

Old root-level files (`manifest.json`, `manifest.firefox.json`, `background.js`, `content.js`, `popup/`) are deleted after migration.

## Firefox MV2 Adaptations

Firefox `manifest.json` (from current `manifest.firefox.json`):
- `manifest_version: 2`
- `browser_action` instead of `action`
- `background.scripts: ["background.js"]` + `persistent: false`
- `content_security_policy` as a flat string
- `host_permissions` merged into `permissions`
- `browser_specific_settings.gecko` with `id: "flowshield@flowshield.app"`, `strict_min_version: "91.0"`

Firefox `background.js` — two lines changed (currently lines 68–69):
```js
// Before (MV3)
await chrome.action.setBadgeText({ text });
await chrome.action.setBadgeBackgroundColor({ color });

// After (MV2)
await chrome.browserAction.setBadgeText({ text });
await chrome.browserAction.setBadgeBackgroundColor({ color });
```

`popup.js` and `content.js` require no changes.

## Build Script

**`browser-extension/package.json`**:
```json
{
  "scripts": {
    "build:chrome":  "node build.js chrome",
    "build:firefox": "node build.js firefox",
    "build":         "node build.js chrome && node build.js firefox"
  },
  "dependencies": {
    "archiver": "^7.0.1"
  }
}
```

**`browser-extension/build.js`**:
- Accepts `chrome` or `firefox` as CLI argument
- Reads version from `<browser>/manifest.json`
- Zips all files in `<browser>/` into `dist/flowshield-<browser>-<version>.zip`
- Creates `dist/` if missing; overwrites previous zip
- Logs: `✓ dist/flowshield-chrome-1.0.0.zip` on success

**Output files (store-ready):**
- `dist/flowshield-chrome-<version>.zip` — upload to Chrome Web Store Developer Dashboard
- `dist/flowshield-firefox-<version>.zip` — upload to Firefox AMO (addons.mozilla.org)

Both zips have `manifest.json` at the root, which is required by both stores.

## Migration Steps

1. Create `browser-extension/chrome/` — copy all current root-level extension files
2. Create `browser-extension/firefox/` — copy same files, apply MV2 adaptations
3. Delete old root-level extension files (`manifest.json`, `manifest.firefox.json`, `background.js`, `content.js`, `popup/`)
4. Write `package.json` and `build.js`
5. Run `npm install && npm run build` — verify both zips are produced and valid
6. Update `browser-extension/README.md` with new load instructions and build usage
7. Update `.claude/rules/browser-extension.md` to reflect new paths

## Testing

- Load `chrome/` unpacked in Chrome (`chrome://extensions` → Load unpacked)
- Load `firefox/manifest.json` as temporary add-on in Firefox (`about:debugging`)
- Verify toolbar badge updates, popup opens, session sync works on both
- Verify `npm run build` produces two zips with `manifest.json` at root of each
