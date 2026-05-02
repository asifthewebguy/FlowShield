#!/usr/bin/env bash
#
# Bump the flowshield-bin AUR PKGBUILD to a new GitHub Release.
#
# Usage:
#   cd ~/path/to/flowshield-aur          # the separate AUR repo clone
#   ../FlowShield/scripts/release/update-aur.sh v3.0.0-alpha.0
#
# What it does:
#   1. Verify the GitHub Release for the given tag exists and has the
#      .AppImage asset attached.
#   2. Download the .AppImage, compute its SHA-256.
#   3. Rewrite the local PKGBUILD's `pkgver` and `sha256sums` to point
#      at the new release.
#   4. Run `makepkg --printsrcinfo > .SRCINFO` so the AUR has the
#      canonical metadata (AUR rejects pushes without a matching one).
#
# After running, review `git diff`, then `git commit && git push` to
# publish to AUR.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <tag>" >&2
  echo "  e.g. $0 v3.0.0-alpha.0" >&2
  exit 2
fi

TAG="$1"
# Strip the leading 'v' for pkgver. AUR convention: pkgver is just the
# semver without prefix. The 'v' stays in the GitHub URL though.
PKGVER="${TAG#v}"
REPO="asifthewebguy/FlowShield"
APPIMAGE="flowshield_${PKGVER}_amd64.AppImage"
URL="https://github.com/${REPO}/releases/download/${TAG}/${APPIMAGE}"

if [ ! -f PKGBUILD ]; then
  echo "✗ No PKGBUILD in $(pwd) — run this from inside the flowshield-aur clone" >&2
  exit 1
fi

echo "→ Verifying release ${TAG} on ${REPO} …"
if ! curl -sIfL "$URL" >/dev/null; then
  echo "✗ ${URL} returned non-200. Has the GitHub Actions release workflow finished?" >&2
  exit 1
fi

echo "→ Downloading ${APPIMAGE} for SHA-256 calculation …"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -sL -o "$TMP/$APPIMAGE" "$URL"
SHA=$(sha256sum "$TMP/$APPIMAGE" | awk '{print $1}')
echo "  sha256 = ${SHA}"

echo "→ Patching PKGBUILD …"
# Update pkgver + sha256sums in-place. PKGBUILD is just bash, so
# straightforward sed on the well-known field names works.
sed -i \
  -e "s/^pkgver=.*/pkgver=${PKGVER}/" \
  -e "s/^pkgrel=.*/pkgrel=1/" \
  -e "s/^sha256sums=(.*)/sha256sums=('${SHA}')/" \
  PKGBUILD

# Regenerate .SRCINFO — AUR rejects pushes without a matching one.
if command -v makepkg >/dev/null; then
  makepkg --printsrcinfo > .SRCINFO
  echo "→ Regenerated .SRCINFO"
else
  echo "⚠ makepkg not installed — skipping .SRCINFO regen. Run manually before pushing:"
  echo "    makepkg --printsrcinfo > .SRCINFO"
fi

echo
echo "✓ PKGBUILD updated to ${PKGVER}"
echo "  Review:  git diff"
echo "  Publish: git commit -am 'flowshield-bin ${PKGVER}' && git push"
