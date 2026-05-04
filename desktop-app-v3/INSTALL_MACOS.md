# Installing FlowShield on macOS

FlowShield Desktop v3 ships as a **universal `.dmg`** that runs natively on
Intel and Apple Silicon Macs. It's currently an unsigned/unnotarized alpha,
so the first launch needs a one-time Gatekeeper bypass — about 30 seconds
of clicks.

> **macOS version:** 12 (Monterey) or newer recommended.
> **Both architectures supported** by the same file: Intel (x86_64) and Apple Silicon (arm64).

---

## TL;DR

```bash
# 1. Download the latest .dmg from GitHub Releases
open "https://github.com/asifthewebguy/FlowShield/releases/latest"

# 2. Mount + drag FlowShield.app to /Applications

# 3. Strip the quarantine attribute so Gatekeeper trusts it
xattr -d com.apple.quarantine /Applications/FlowShield.app

# 4. Launch
open /Applications/FlowShield.app
```

---

## Step-by-step

### 1. Download

Visit <https://github.com/asifthewebguy/FlowShield/releases/latest> and grab:

- `FlowShield_X.Y.Z_universal.dmg` — the installer (~80 MB)
- *(Optional)* `SHA256SUMS` and `SHA256SUMS.asc` — for integrity verification

You can also click the **macOS** pill on the [flowshield.app](https://flowshield.app)
homepage, which links to the same Releases page.

### 2. Verify integrity *(optional but recommended)*

```bash
cd ~/Downloads

# Confirm the SHA256SUMS file was signed by us (key fingerprint should match
# the one published on the project's GitHub profile / README)
gpg --verify SHA256SUMS.asc

# Confirm the .dmg matches the published checksum
shasum -a 256 -c SHA256SUMS --ignore-missing
```

If `gpg --verify` says **"Good signature"** and `shasum -c` says **"OK"**,
you have an authentic copy.

### 3. Install

```bash
open ~/Downloads/FlowShield_*_universal.dmg
```

The DMG window opens. Drag **FlowShield.app** to your `/Applications`
folder, then close + eject the DMG.

### 4. First launch (Gatekeeper bypass)

FlowShield isn't notarized yet (we're working on it — see [Why isn't it
notarized?](#why-isnt-it-notarized) below). macOS will block the first
launch by default. Pick one of these two paths:

#### Path A — Terminal (one command, fastest)

```bash
xattr -d com.apple.quarantine /Applications/FlowShield.app
open /Applications/FlowShield.app
```

That's it. The app launches normally and stays trusted on every future
launch.

#### Path B — System Settings (click-only)

1. Open **Finder → Applications**, **right-click** (or Control-click)
   `FlowShield.app` → **Open**.
2. macOS shows *"Apple could not verify FlowShield is free of malware"*
   with no Open button (this is normal for macOS 15 Sequoia and newer).
   Click **Done**.
3. Open **System Settings → Privacy & Security**, scroll down to the
   **Security** section. You'll see a banner:
   > "FlowShield" was blocked to protect your Mac.
4. Click **Open Anyway**, confirm with Touch ID or your password.
5. The app launches and is trusted from now on.

---

## After install

You'll find FlowShield in:

- **Menu bar:** an icon at the top-right (an `NSStatusItem`). During an
  active focus session, the icon morphs into a progress ring + countdown.
- **Applications folder:** `/Applications/FlowShield.app`
- **Login items:** FlowShield enables "Open at Login" on first launch so it
  resumes after a reboot. Toggle it off in **System Settings → General →
  Login Items** if you don't want this.

### macOS permissions you'll be prompted for

| Prompt | When | Why |
|---|---|---|
| **Notifications** | First launch | Session-end + break reminders |
| **Accessibility** | First focus session | Read foreground app names for activity tracking |
| **Administrator password** | First Deep Work toggle | Edit `/etc/hosts` to block distraction sites (via `osascript` elevation) |

All three are optional — declining only disables the matching feature.

---

## Updating

The app polls GitHub Releases every 12 hours. When a newer `v3.*` release
exists, you'll see a banner at the top of the dashboard with a **Download**
button — click it to open the new Release page in your browser, then
repeat the install steps above with the new `.dmg`.

You can also check manually: just download the latest `.dmg` from
[Releases](https://github.com/asifthewebguy/FlowShield/releases/latest)
and drag the new `FlowShield.app` over the existing one in `/Applications`.

---

## Uninstalling

```bash
# Quit FlowShield first (menu bar → Quit, or `pkill FlowShield`)
rm -rf /Applications/FlowShield.app
rm -rf ~/Library/Application\ Support/app.flowshield.desktop
rm -rf ~/Library/Caches/app.flowshield.desktop
rm -rf ~/Library/Preferences/app.flowshield.desktop.plist
```

The first line removes the app; the rest clean up local data (encrypted
session cache, preferences, offline-sync queue).

---

## Troubleshooting

### *"FlowShield is damaged and can't be opened"*

This means the quarantine attribute is set but the bypass hasn't been
applied yet. Run:

```bash
xattr -d com.apple.quarantine /Applications/FlowShield.app
```

If that fails with "No such xattr", try:

```bash
xattr -cr /Applications/FlowShield.app   # clears all extended attributes
```

### Menu-bar icon doesn't appear

macOS sometimes hides menu-bar items when there isn't enough horizontal
space. Try:

- Quit some other menu-bar app temporarily to free space, OR
- Use [Bartender](https://www.macbartender.com/) / [Hidden Bar](https://github.com/dwarvesf/hidden) to manage menu-bar overflow.

### Activity tracker isn't recording

Open **System Settings → Privacy & Security → Accessibility** and confirm
**FlowShield** is enabled. Without this permission the tracker can't read
foreground app names.

### Deep Work mode does nothing

Open **System Settings → Privacy & Security → Full Disk Access** and add
**FlowShield**. Editing `/etc/hosts` requires it on macOS 13+.

If the elevation prompt never appears at all, try toggling Deep Work off
then on again — `osascript` occasionally fails to bring its prompt to the
foreground on the first try.

---

## Why isn't it notarized?

Apple notarization requires an **Apple Developer Program** membership
(US$99/year). FlowShield is open-source and self-funded; we're rolling out
a notarized build once the v3 alpha stabilizes and we can justify the
recurring cost.

Until then, the one-time `xattr -d com.apple.quarantine` bypass is
equivalent in safety to opening any unsigned binary you trust the source
of — the SHA256 + GPG verification steps above let you confirm the binary
came from us.

---

## Help / feedback

- File a bug or feature request: <https://github.com/asifthewebguy/FlowShield/issues>
- Source: <https://github.com/asifthewebguy/FlowShield>
- Web dashboard: <https://flowshield.app>
