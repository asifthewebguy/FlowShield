# AUR auto-publish

Tag-driven publishing of the `flowshield-bin` Arch User Repository package.

## How it works

`.github/workflows/desktop-v3-release.yml` has a `publish-to-aur` job that runs
after `sign-and-release`. On every `v3.*` tag it:

1. Downloads the freshly built `.AppImage` from the workflow artifacts.
2. Computes its SHA-256.
3. Renders [`PKGBUILD.template`](./PKGBUILD.template) with the new `pkgver` +
   `sha256sums` into a working `PKGBUILD`.
4. Hands that PKGBUILD to [`KSXGitHub/github-actions-deploy-aur`][action], which
   regenerates `.SRCINFO`, commits, and pushes to `aur@aur.archlinux.org`.

The job no-ops cleanly when the SSH secret isn't set, so unrelated forks and
test runs don't fail.

[action]: https://github.com/marketplace/actions/github-action-deploy-aur

## One-time bootstrap (you, manually)

These steps only need to happen once. After that, every release flows through
CI automatically.

### 1. AUR account

Create an account at <https://aur.archlinux.org/register>. Pick any username —
it's only visible as the package maintainer.

### 2. CI-only SSH keypair

Generate a dedicated key (don't reuse a personal one — this one lives in CI):

```bash
ssh-keygen -t ed25519 -C "flowshield-aur-ci" -f ~/.ssh/flowshield_aur_ci -N ""
```

Add the **public** key to your AUR account at
<https://aur.archlinux.org/account> → "SSH Public Key" field.

### 3. Initial PKGBUILD push (creates the AUR package)

The AUR repo doesn't exist yet; the first commit is what creates it. Render the
template locally and push by hand. From a scratch directory:

```bash
git clone ssh://aur@aur.archlinux.org/flowshield-bin.git
cd flowshield-bin

# Render template against the latest GitHub Release.
TAG=v3.2.1-alpha.0                 # whatever's current
TAGVER="${TAG#v}"                  # 3.2.1-alpha.0 (URL form)
PKGVER="${TAGVER//-/.}"            # 3.2.1.alpha.0 (AUR form, no hyphens)
APPIMAGE_URL="https://github.com/asifthewebguy/FlowShield/releases/download/${TAG}/FlowShield_${TAGVER}_amd64.AppImage"
SHA=$(curl -sL "$APPIMAGE_URL" | sha256sum | awk '{print $1}')

sed \
  -e "s/__PKGVER__/${PKGVER}/g" \
  -e "s/__TAGVER__/${TAGVER}/g" \
  -e "s/__SHA256__/${SHA}/g" \
  ../FlowShield/scripts/release/aur/PKGBUILD.template > PKGBUILD

# Generate .SRCINFO (AUR rejects pushes without one).
makepkg --printsrcinfo > .SRCINFO

# Sanity-check the build works locally.
makepkg -srci   # builds + installs locally

git add PKGBUILD .SRCINFO
git commit -m "flowshield-bin ${PKGVER}: initial release"
git push
```

After this, `flowshield-bin` is live on AUR and CI takes over.

### 4. GitHub secret

Add the **private** key to repo secrets:

- Settings → Secrets and variables → Actions → New repository secret
- Name: `AUR_SSH_PRIVATE_KEY`
- Value: contents of `~/.ssh/flowshield_aur_ci` (full file, including the
  `-----BEGIN OPENSSH PRIVATE KEY-----` header)

Once that secret exists, the `publish-to-aur` job will run on the next `v3.*`
tag.

## Verifying it worked

After a release tag fires:

1. Check the workflow run: `gh run list --workflow desktop-v3-release.yml --limit 1`
2. The `publish-to-aur` job should report success.
3. Confirm on AUR: <https://aur.archlinux.org/packages/flowshield-bin>
   — `pkgver` should match the tag.
4. End-user install path: `yay -Syu flowshield-bin` (or any AUR helper).

## Troubleshooting

- **SSH auth fails** — verify the public key on the AUR account matches the
  private key in `AUR_SSH_PRIVATE_KEY`. The error in CI logs will look like
  `Permission denied (publickey)`.
- **`.SRCINFO` mismatch** — the action regenerates it; if it still rejects, the
  `PKGBUILD` is malformed. Render the template locally and run
  `namcap PKGBUILD` to validate.
- **AppImage 404** — the `publish-to-aur` job depends on `sign-and-release`, so
  the GitHub Release should always exist by the time AUR runs. If it doesn't,
  the `sign-and-release` job failed first.
