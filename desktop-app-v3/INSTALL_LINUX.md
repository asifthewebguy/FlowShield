# Installing FlowShield on Linux

FlowShield Desktop v3 ships four ways on Linux — pick whichever your
distro prefers:

| Format | Best for | Install path |
|---|---|---|
| **AUR** (`flowshield-bin`) | Arch, Manjaro, EndeavourOS | `yay -S flowshield-bin` (auto-updates) |
| **`.rpm`** | Fedora, RHEL, openSUSE | `sudo dnf install ./FlowShield-X.Y.Z.rpm` |
| **`.deb`** | Debian, Ubuntu, Pop!_OS, Mint | `sudo apt install ./FlowShield_X.Y.Z.deb` |
| **`.AppImage`** | Any distro (no install required) | `chmod +x ./FlowShield_X.Y.Z.AppImage && ./FlowShield...` |

> **Architecture:** all packages are `amd64` / `x86_64`. ARM Linux isn't
> supported yet.

> **Display server:** X11, GNOME Wayland (XWayland fallback), and KDE
> Wayland are all supported. Pure Wayland with no XWayland is degraded —
> idle/AFK detection won't work because the underlying API needs X.

---

## Quick install

### Arch / Manjaro (recommended for Arch users)

```bash
yay -S flowshield-bin
# or: paru -S flowshield-bin
```

That's it. Future updates flow through `yay -Syu` like any other AUR
package — no manual re-downloads.

### Fedora / RHEL / openSUSE

```bash
cd ~/Downloads
gh release download v3.3.0-alpha.0 --repo asifthewebguy/FlowShield \
  --pattern '*.rpm' --pattern '*.rpm.asc' \
  --pattern 'SHA256SUMS' --pattern 'SHA256SUMS.asc'
sudo dnf install ./FlowShield-3.3.0-alpha.0-1.x86_64.rpm
```

If you don't have the GitHub CLI installed, just download the `.rpm`
straight from <https://github.com/asifthewebguy/FlowShield/releases/latest>.

### Debian / Ubuntu / Pop!_OS / Mint

```bash
cd ~/Downloads
gh release download v3.3.0-alpha.0 --repo asifthewebguy/FlowShield \
  --pattern '*_amd64.deb' --pattern '*_amd64.deb.asc' \
  --pattern 'SHA256SUMS' --pattern 'SHA256SUMS.asc'
sudo apt install ./FlowShield_3.3.0-alpha.0_amd64.deb
```

### AppImage (any distro, no install)

```bash
cd ~/Downloads
gh release download v3.3.0-alpha.0 --repo asifthewebguy/FlowShield \
  --pattern '*.AppImage' --pattern '*.AppImage.asc' \
  --pattern 'SHA256SUMS' --pattern 'SHA256SUMS.asc'
chmod +x FlowShield_3.3.0-alpha.0_amd64.AppImage
./FlowShield_3.3.0-alpha.0_amd64.AppImage
```

To get a desktop entry (so FlowShield shows up in your app menu), drop the
AppImage into `~/Apps/` and use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher)
or run `--appimage-integrate` once.

---

## Verify integrity *(optional but recommended)*

We GPG-sign every release. Verify before installing:

```bash
cd ~/Downloads

# 1. Confirm SHA256SUMS is signed by us
gpg --verify SHA256SUMS.asc
#  → Good signature from "FlowShield <noreply@flowshield.app>"

# 2. Confirm your downloaded file matches the published checksum
sha256sum -c SHA256SUMS --ignore-missing
#  → FlowShield_3.3.0-alpha.0_amd64.AppImage: OK
```

You can also verify a single package directly:

```bash
gpg --verify FlowShield-3.3.0-alpha.0-1.x86_64.rpm.asc \
            FlowShield-3.3.0-alpha.0-1.x86_64.rpm
```

---

## After install

You'll find FlowShield in:

- **System tray** — an icon next to your clock (uses `AppIndicator` /
  `StatusNotifier`). On GNOME Wayland you may need the
  [AppIndicator and KStatusNotifierItem Support](https://extensions.gnome.org/extension/615/appindicator-support/)
  extension; KDE/XFCE/Cinnamon work out of the box.
- **App menu** — searchable as "FlowShield"
- **CLI** — the binary is installed at `/usr/bin/flowshield-desktop`
- **Autostart** — FlowShield enables auto-start on first launch via a
  `.desktop` file in `~/.config/autostart/`. Delete that file if you
  don't want it.

### Permissions you may be prompted for

| Prompt | When | Why |
|---|---|---|
| **Notification permission** | First launch | Session-end + break reminders |
| **Polkit (`pkexec`)** — admin password | First Deep Work toggle | Edit `/etc/hosts` to block distraction sites |

Activity tracking (foreground-window queries) is unprivileged on X11 and
on XWayland — no permission prompt needed.

---

## Updating

### AUR users
Updates flow through your normal `yay -Syu` — there's nothing to do
manually. The `publish-to-aur` CI job pushes a new `pkgver` to AUR within
~10 minutes of every GitHub release.

### Direct-download users (.rpm / .deb / .AppImage)
The app polls GitHub Releases every 12 hours. When a newer `v3.*` release
exists, you'll see a banner at the top of the dashboard with a **Download**
button — click it, then re-run the install command for your distro:

```bash
# Fedora / RHEL
sudo dnf upgrade ./FlowShield-X.Y.Z-1.x86_64.rpm

# Debian / Ubuntu
sudo apt install ./FlowShield_X.Y.Z_amd64.deb   # 'install' upgrades in place

# AppImage
chmod +x ./FlowShield_X.Y.Z_amd64.AppImage      # replace the old file
```

---

## Uninstalling

### AUR

```bash
sudo pacman -Rns flowshield-bin
```

### .rpm

```bash
sudo dnf remove flow-shield   # note: the package name uses a hyphen
```

### .deb

```bash
sudo apt remove flow-shield
sudo apt purge flow-shield   # also removes user-system config
```

### AppImage

Delete the AppImage file. To remove local data:

```bash
rm -rf ~/.local/share/app.flowshield.desktop
rm -rf ~/.config/app.flowshield.desktop
rm -f  ~/.config/autostart/FlowShield.desktop
```

---

## Troubleshooting

### Window is blank / flickers on Wayland

We disable WebKitGTK's DMA-BUF renderer at startup specifically because
of this (see [PR #55](https://github.com/asifthewebguy/FlowShield/pull/55)).
If you still see flicker on a recent kernel + Mesa, set the env var
manually:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 flowshield-desktop
```

If it works with that, file an issue with your distro + Mesa version.

### Tray icon doesn't appear (GNOME Wayland)

GNOME removed legacy tray support. Install the
[AppIndicator and KStatusNotifierItem Support](https://extensions.gnome.org/extension/615/appindicator-support/)
extension and re-launch FlowShield.

### Close button stops working after the second click

Fixed in v3.2.1 — on Linux, FlowShield minimizes the window instead of
fully hiding it on close (libdecor's CSD bindings break on hide/show
cycles). If you're still seeing it, you're on an older build — upgrade.

### Activity tracker is silent

Most likely you're on **pure Wayland** with no XWayland. The
`active-win-pos-rs` crate we use for foreground-window queries currently
has no Wayland-native backend. Workarounds:
- Switch to an Xorg session at login
- Use a desktop environment that defaults to XWayland (most do)

### `pkexec` prompt never appears for Deep Work

Confirm `polkit` is installed and your user is in the `wheel` (Fedora) or
`sudo` (Debian/Ubuntu) group. On minimal installs:

```bash
# Fedora
sudo dnf install polkit polkit-gnome   # gnome-authentication-agent

# Debian/Ubuntu
sudo apt install policykit-1 policykit-1-gnome
```

Then log out + in.

### "No public key" when verifying GPG

You haven't imported our public key yet. Grab it from the project's GitHub
profile or pull from a keyserver:

```bash
gpg --keyserver keyserver.ubuntu.com --recv-keys F015C2B094B233F5
```

(Replace the key id with whatever's listed on the project's
[Releases page](https://github.com/asifthewebguy/FlowShield/releases) under
"Verifying releases.")

---

## Building from source

If you'd rather compile yourself:

```bash
# System dependencies (Fedora)
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel \
                 librsvg2-devel openssl-devel libXScrnSaver-devel \
                 patchelf file rust nodejs

# System dependencies (Debian/Ubuntu)
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
                 librsvg2-dev libssl-dev libxss-dev patchelf file \
                 rustc cargo nodejs npm

# Build
git clone https://github.com/asifthewebguy/FlowShield.git
cd FlowShield/desktop-app-v3
npm install
npm run tauri:build
# Output: src-tauri/target/release/bundle/{deb,rpm,appimage}/
```

For dev mode with hot reload: `npm run tauri:dev`.

---

## Help / feedback

- File a bug or feature request: <https://github.com/asifthewebguy/FlowShield/issues>
- Source: <https://github.com/asifthewebguy/FlowShield>
- Web dashboard: <https://flowshield.app>
- AUR package page: <https://aur.archlinux.org/packages/flowshield-bin>
