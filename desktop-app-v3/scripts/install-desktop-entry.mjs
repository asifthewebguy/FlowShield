#!/usr/bin/env node
// Install a freedesktop .desktop file pointing at the dev binary so GNOME /
// KDE / etc. show the FlowShield icon in the taskbar / dock when running
// `npm run tauri:dev`. One-time setup per machine.
//
// Without this, GNOME Shell on Wayland matches taskbar icons by `app_id`
// against an installed .desktop file — and dev builds aren't installed
// anywhere, so it falls back to a generic icon. This is a Linux-only
// workaround; macOS / Windows handle dev icons differently and don't
// need it.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Tauri bundle identifier already ends in `.desktop`, which IS the
// XDG file extension — so the filename matches the identifier verbatim.
// (No re-appending `.desktop` or we'd end up with `*.desktop.desktop`.)
const APP_ID = 'app.flowshield.desktop';

if (platform() !== 'linux') {
  console.log(`Not Linux (${platform()}) — skipping. macOS / Windows dev builds`);
  console.log(`already pick up the right icon from the bundle config.`);
  process.exit(0);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..'); // desktop-app-v3/
const binary = resolve(repoRoot, 'src-tauri/target/debug/flowshield-desktop');
const iconPath = resolve(repoRoot, 'src-tauri/icons/icon.png');

if (!existsSync(iconPath)) {
  console.error(`✗ Icon not found at ${iconPath}`);
  console.error(`  Did you check out the latest main? The branded icons live in src-tauri/icons/.`);
  process.exit(1);
}

const installDir = join(homedir(), '.local', 'share', 'applications');
const targetPath = join(installDir, APP_ID); // APP_ID already ends in .desktop

// Transitional cleanup: an earlier version of this script appended an
// extra `.desktop`, leaving `app.flowshield.desktop.desktop` lying around.
// Remove it if present so GNOME doesn't pick the wrong one.
const legacyDuplicate = join(installDir, `${APP_ID}.desktop`);
if (existsSync(legacyDuplicate)) {
  rmSync(legacyDuplicate);
  console.log(`✓ Removed legacy duplicate ${legacyDuplicate}`);
}

const contents = `[Desktop Entry]
Name=FlowShield (dev)
Comment=FlowShield desktop client — development build
Exec=${binary}
Icon=${iconPath}
Type=Application
Terminal=false
StartupWMClass=${APP_ID}
StartupNotify=true
Categories=Utility;Productivity;
`;

mkdirSync(installDir, { recursive: true });
writeFileSync(targetPath, contents);
console.log(`✓ Wrote ${targetPath}`);

// Best-effort: refresh GNOME's desktop file cache so the new entry shows up
// without a logout/login. Not all distros ship update-desktop-database; if
// it's missing we just continue — GNOME picks it up at next session start.
try {
  execSync(`update-desktop-database ${installDir}`, { stdio: 'ignore' });
  console.log(`✓ Refreshed desktop database`);
} catch {
  console.log(`⚠ update-desktop-database not available — entry will activate at next login`);
}

if (!existsSync(binary)) {
  console.log('');
  console.log(`Note: ${binary} doesn't exist yet.`);
  console.log(`Run \`npm run tauri:dev\` once to build it. The .desktop entry`);
  console.log(`will start working as soon as the binary appears.`);
}

console.log('');
console.log(`Done. Quit any running FlowShield window (right-click tray → Quit) and`);
console.log(`relaunch \`npm run tauri:dev\` — the FlowShield logo should now appear`);
console.log(`in your taskbar / dock.`);
