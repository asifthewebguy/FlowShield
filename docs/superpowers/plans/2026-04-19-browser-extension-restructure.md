# Browser Extension Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the browser extension into two fully independent, store-submittable packages at `browser-extension/chrome/` (MV3) and `browser-extension/firefox/` (MV2), with a `build.js` + `package.json` that zips each into a distributable file ready for Chrome Web Store and Firefox AMO upload.

**Architecture:** Copy current extension files verbatim into `chrome/`; copy into `firefox/` then apply two targeted MV2 adaptations (`manifest.json` replacement + 2-line background.js change). A single `build.js` driven by npm scripts zips each folder into `dist/` using `archiver`. Old root-level files are deleted after both copies are verified.

**Tech Stack:** Node.js (built-ins: `fs`, `path`), `archiver@^7.0.1`, bash shell commands for file operations.

---

## File Map

| Action | Path |
|--------|------|
| Create | `browser-extension/chrome/manifest.json` |
| Create | `browser-extension/chrome/background.js` |
| Create | `browser-extension/chrome/content.js` |
| Create | `browser-extension/chrome/popup/popup.html` |
| Create | `browser-extension/chrome/popup/popup.js` |
| Create | `browser-extension/chrome/popup/popup.css` |
| Create | `browser-extension/chrome/icons/icon16.png` |
| Create | `browser-extension/chrome/icons/icon48.png` |
| Create | `browser-extension/chrome/icons/icon128.png` |
| Create | `browser-extension/firefox/manifest.json` |
| Create | `browser-extension/firefox/background.js` |
| Create | `browser-extension/firefox/content.js` |
| Create | `browser-extension/firefox/popup/popup.html` |
| Create | `browser-extension/firefox/popup/popup.js` |
| Create | `browser-extension/firefox/popup/popup.css` |
| Create | `browser-extension/firefox/icons/icon16.png` |
| Create | `browser-extension/firefox/icons/icon48.png` |
| Create | `browser-extension/firefox/icons/icon128.png` |
| Create | `browser-extension/package.json` |
| Create | `browser-extension/build.js` |
| Delete | `browser-extension/manifest.json` |
| Delete | `browser-extension/manifest.firefox.json` |
| Delete | `browser-extension/background.js` |
| Delete | `browser-extension/content.js` |
| Delete | `browser-extension/popup/` (entire dir) |
| Modify | `browser-extension/README.md` |
| Modify | `.claude/rules/browser-extension.md` |
| Modify | `.gitignore` |

---

## Task 1: Scaffold `chrome/` directory

**Files:**
- Create: `browser-extension/chrome/` (directory tree)

- [ ] **Step 1: Create chrome directory structure**

```bash
mkdir -p browser-extension/chrome/popup
mkdir -p browser-extension/chrome/icons
```

- [ ] **Step 2: Copy all extension files into chrome/**

```bash
cp browser-extension/manifest.json           browser-extension/chrome/manifest.json
cp browser-extension/background.js           browser-extension/chrome/background.js
cp browser-extension/content.js              browser-extension/chrome/content.js
cp browser-extension/popup/popup.html        browser-extension/chrome/popup/popup.html
cp browser-extension/popup/popup.js          browser-extension/chrome/popup/popup.js
cp browser-extension/popup/popup.css         browser-extension/chrome/popup/popup.css
cp browser-extension/icons/icon16.png        browser-extension/chrome/icons/icon16.png
cp browser-extension/icons/icon48.png        browser-extension/chrome/icons/icon48.png
cp browser-extension/icons/icon128.png       browser-extension/chrome/icons/icon128.png
```

- [ ] **Step 3: Verify chrome/ structure**

```bash
find browser-extension/chrome -type f | sort
```

Expected output:
```
browser-extension/chrome/background.js
browser-extension/chrome/content.js
browser-extension/chrome/icons/icon16.png
browser-extension/chrome/icons/icon48.png
browser-extension/chrome/icons/icon128.png
browser-extension/chrome/manifest.json
browser-extension/chrome/popup/popup.css
browser-extension/chrome/popup/popup.html
browser-extension/chrome/popup/popup.js
```

- [ ] **Step 4: Commit**

```bash
git add browser-extension/chrome/
git commit -m "feat(extension): scaffold chrome/ MV3 directory"
```

---

## Task 2: Scaffold `firefox/` directory — copy files

**Files:**
- Create: `browser-extension/firefox/` (directory tree, verbatim copy before adaptations)

- [ ] **Step 1: Create firefox directory structure**

```bash
mkdir -p browser-extension/firefox/popup
mkdir -p browser-extension/firefox/icons
```

- [ ] **Step 2: Copy all files into firefox/ (same as chrome for now)**

```bash
cp browser-extension/background.js           browser-extension/firefox/background.js
cp browser-extension/content.js              browser-extension/firefox/content.js
cp browser-extension/popup/popup.html        browser-extension/firefox/popup/popup.html
cp browser-extension/popup/popup.js          browser-extension/firefox/popup/popup.js
cp browser-extension/popup/popup.css         browser-extension/firefox/popup/popup.css
cp browser-extension/icons/icon16.png        browser-extension/firefox/icons/icon16.png
cp browser-extension/icons/icon48.png        browser-extension/firefox/icons/icon48.png
cp browser-extension/icons/icon128.png       browser-extension/firefox/icons/icon128.png
```

(manifest.json is written from scratch in Task 3 — do not copy it here)

- [ ] **Step 3: Verify firefox/ structure (no manifest.json yet)**

```bash
find browser-extension/firefox -type f | sort
```

Expected:
```
browser-extension/firefox/background.js
browser-extension/firefox/content.js
browser-extension/firefox/icons/icon16.png
browser-extension/firefox/icons/icon48.png
browser-extension/firefox/icons/icon128.png
browser-extension/firefox/popup/popup.css
browser-extension/firefox/popup/popup.html
browser-extension/firefox/popup/popup.js
```

---

## Task 3: Write `firefox/manifest.json` (MV2)

**Files:**
- Create: `browser-extension/firefox/manifest.json`

- [ ] **Step 1: Write the Firefox MV2 manifest**

Create `browser-extension/firefox/manifest.json` with this exact content:

```json
{
  "manifest_version": 2,
  "name": "FlowShield",
  "version": "1.0.0",
  "description": "Track browser activity and manage focus sessions from FlowShield.",
  "icons": {
    "16":  "icons/icon16.png",
    "48":  "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "browser_action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16":  "icons/icon16.png",
      "48":  "icons/icon48.png"
    },
    "default_title": "FlowShield"
  },
  "background": {
    "scripts": ["background.js"],
    "persistent": false
  },
  "permissions": [
    "tabs",
    "storage",
    "alarms",
    "webNavigation",
    "activeTab",
    "https://flowshield.app/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://flowshield.app/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "content_security_policy": "script-src 'self'; object-src 'self'",
  "browser_specific_settings": {
    "gecko": {
      "id": "flowshield@flowshield.app",
      "strict_min_version": "91.0"
    }
  }
}
```

- [ ] **Step 2: Verify manifest is valid JSON with correct manifest_version**

```bash
node -e "const m = require('./browser-extension/firefox/manifest.json'); console.log('version:', m.manifest_version, '| name:', m.name, '| gecko id:', m.browser_specific_settings.gecko.id)"
```

Expected: `version: 2 | name: FlowShield | gecko id: flowshield@flowshield.app`

- [ ] **Step 3: Commit**

```bash
git add browser-extension/firefox/
git commit -m "feat(extension): scaffold firefox/ MV2 directory"
```

---

## Task 4: Adapt `firefox/background.js` — replace `chrome.action` with `chrome.browserAction`

**Files:**
- Modify: `browser-extension/firefox/background.js` (2 lines only)

`chrome.action` is MV3-only. In MV2, the equivalent is `chrome.browserAction`.

- [ ] **Step 1: Confirm the exact lines to change**

```bash
grep -n "chrome\.action" browser-extension/firefox/background.js
```

Expected:
```
68:  await chrome.action.setBadgeText({ text });
69:  await chrome.action.setBadgeBackgroundColor({ color });
```

- [ ] **Step 2: Apply the replacement**

```bash
sed -i 's/chrome\.action\.setBadgeText/chrome.browserAction.setBadgeText/g' browser-extension/firefox/background.js
sed -i 's/chrome\.action\.setBadgeBackgroundColor/chrome.browserAction.setBadgeBackgroundColor/g' browser-extension/firefox/background.js
```

- [ ] **Step 3: Verify the change**

```bash
grep -n "chrome\.action\|chrome\.browserAction" browser-extension/firefox/background.js
```

Expected (no `chrome.action` remaining):
```
68:  await chrome.browserAction.setBadgeText({ text });
69:  await chrome.browserAction.setBadgeBackgroundColor({ color });
```

- [ ] **Step 4: Verify Chrome copy is unchanged**

```bash
grep -n "chrome\.action" browser-extension/chrome/background.js
```

Expected:
```
68:  await chrome.action.setBadgeText({ text });
69:  await chrome.action.setBadgeBackgroundColor({ color });
```

- [ ] **Step 5: Commit**

```bash
git add browser-extension/firefox/background.js
git commit -m "feat(extension): adapt firefox background.js for MV2 (browserAction)"
```

---

## Task 5: Write `browser-extension/package.json`

**Files:**
- Create: `browser-extension/package.json`

- [ ] **Step 1: Write package.json**

Create `browser-extension/package.json` with this exact content:

```json
{
  "name": "flowshield-browser-extension",
  "version": "1.0.0",
  "private": true,
  "description": "Build scripts for FlowShield browser extensions",
  "scripts": {
    "build:chrome": "node build.js chrome",
    "build:firefox": "node build.js firefox",
    "build": "node build.js chrome && node build.js firefox"
  },
  "dependencies": {
    "archiver": "^7.0.1"
  }
}
```

---

## Task 6: Write `browser-extension/build.js`

**Files:**
- Create: `browser-extension/build.js`

- [ ] **Step 1: Write build.js**

Create `browser-extension/build.js` with this exact content:

```js
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const browser = process.argv[2];

if (!browser || !['chrome', 'firefox'].includes(browser)) {
  console.error('Usage: node build.js <chrome|firefox>');
  process.exit(1);
}

const srcDir = path.join(__dirname, browser);

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory not found: ${srcDir}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
const version = manifest.version;

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const outPath = path.join(distDir, `flowshield-${browser}-${version}.zip`);
const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`✓ ${outPath} (${kb} KB)`);
});

archive.on('error', (err) => {
  console.error('Build failed:', err.message);
  process.exit(1);
});

archive.pipe(output);
// false = files land at zip root, not inside a subdirectory (required by both stores)
archive.directory(srcDir, false);
archive.finalize();
```

---

## Task 7: Install dependencies and run build

**Files:**
- No file changes — verification only

- [ ] **Step 1: Install archiver**

```bash
cd browser-extension && npm install
```

Expected: `added 1 package` (or similar), no errors.

- [ ] **Step 2: Build both extensions**

```bash
npm run build
```

Expected output:
```
✓ dist/flowshield-chrome-1.0.0.zip (XX.X KB)
✓ dist/flowshield-firefox-1.0.0.zip (XX.X KB)
```

- [ ] **Step 3: Verify both zips exist and are non-empty**

```bash
node -e "
const fs = require('fs');
['chrome', 'firefox'].forEach(b => {
  const f = \`dist/flowshield-\${b}-1.0.0.zip\`;
  const stat = fs.statSync(f);
  console.log(\`✓ \${f}: \${(stat.size / 1024).toFixed(1)} KB\`);
});
"
```

Expected: both files reported with a size > 0 KB. Full content is verified by loading in the browsers in Tasks 12 and 13.

- [ ] **Step 4: Commit build tooling**

```bash
cd ..
git add browser-extension/package.json browser-extension/build.js browser-extension/package-lock.json
git commit -m "feat(extension): add npm build script producing store-ready zips"
```

---

## Task 8: Delete old root-level extension files

**Files:**
- Delete: `browser-extension/manifest.json`
- Delete: `browser-extension/manifest.firefox.json`
- Delete: `browser-extension/background.js`
- Delete: `browser-extension/content.js`
- Delete: `browser-extension/popup/` (entire directory)

- [ ] **Step 1: Remove old files**

```bash
rm browser-extension/manifest.json
rm browser-extension/manifest.firefox.json
rm browser-extension/background.js
rm browser-extension/content.js
rm -rf browser-extension/popup
```

- [ ] **Step 2: Verify only expected files remain at browser-extension/ root**

```bash
find browser-extension -maxdepth 1 -type f | sort
```

Expected:
```
browser-extension/build.js
browser-extension/package-lock.json
browser-extension/package.json
browser-extension/README.md
```

- [ ] **Step 3: Commit deletion**

```bash
git add -u browser-extension/
git commit -m "chore(extension): remove old root-level files after migration to chrome/ and firefox/"
```

---

## Task 9: Add `dist/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append dist/ entry**

```bash
echo "browser-extension/dist/" >> .gitignore
```

- [ ] **Step 2: Verify**

```bash
grep "browser-extension/dist" .gitignore
```

Expected: `browser-extension/dist/`

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore browser-extension/dist/"
```

---

## Task 10: Update `browser-extension/README.md`

**Files:**
- Modify: `browser-extension/README.md`

- [ ] **Step 1: Rewrite README**

Replace the full content of `browser-extension/README.md` with:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add browser-extension/README.md
git commit -m "docs(extension): update README for chrome/ firefox/ split and build script"
```

---

## Task 11: Update `.claude/rules/browser-extension.md`

**Files:**
- Modify: `.claude/rules/browser-extension.md`

- [ ] **Step 1: Update the rules file**

Replace the full content of `.claude/rules/browser-extension.md` with:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/browser-extension.md
git commit -m "docs(extension): update CLAUDE rules for chrome/ firefox/ split"
```

---

## Task 12: Manual smoke test — Chrome

- [ ] **Step 1: Load extension in Chrome**

Open `chrome://extensions` → Developer mode ON → Load unpacked → select `browser-extension/chrome/`

- [ ] **Step 2: Verify toolbar badge appears**

Navigate to any site. Badge should show a time (e.g. `25:00`) or be empty if no active session.

- [ ] **Step 3: Verify popup opens**

Click the FlowShield icon. Should show sign-in form or active session timer (if logged in).

- [ ] **Step 4: Verify no console errors**

In Chrome DevTools → Extensions → FlowShield → Service Worker → Inspect. Console should be clean.

---

## Task 13: Manual smoke test — Firefox

- [ ] **Step 1: Load extension in Firefox**

Open `about:debugging` → This Firefox → Load Temporary Add-on → select `browser-extension/firefox/manifest.json`

- [ ] **Step 2: Verify toolbar badge appears**

Navigate to any site. Badge behavior should match Chrome.

- [ ] **Step 3: Verify popup opens**

Click the FlowShield icon. Should show sign-in form or active session timer.

- [ ] **Step 4: Verify no console errors**

In Firefox → `about:debugging` → FlowShield → Inspect. Console should be clean.

---

## Task 14: Final verification commit

- [ ] **Step 1: Verify git status is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Verify dist/ is gitignored**

```bash
git status browser-extension/dist/
```

Expected: nothing (directory is ignored)

- [ ] **Step 3: Confirm both zips exist and are non-empty**

```bash
ls -lh browser-extension/dist/
```

Expected: two `.zip` files, each several KB in size.

- [ ] **Step 4: Push**

```bash
git push origin main
```
