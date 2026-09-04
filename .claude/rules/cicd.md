---
description: CI/CD workflows, triggers, steps, and release process for web and desktop
globs: .github/workflows/**
alwaysApply: false
---

# CI/CD

## Workflows (7)

| File | Trigger | Purpose |
|------|---------|---------|
| `web-ci.yml` | push + PR | 3 jobs: **Lint, Type Check & Build** · **Unit Tests** · **Prisma Schema Drift** |
| `release-please.yml` | push to `main` | Maintains the release PR for `desktop-app-v3` from Conventional Commits |
| `desktop-v3-release.yml` | `v3.*` tags + dispatch | Builds Tauri bundles: `build-linux` · `build-macos` (universal) · `build-linux-cuda` |
| `desktop-release.yml` | `v[0-2].*` tags + dispatch | **Dormant** — legacy .NET app; its version (3.0.8) no longer matches any tag it accepts |
| `extension-release.yml` | `ext-v*` tags | Chrome extension release |
| `load-test.yml` | dispatch + Sunday 02:00 UTC | k6 load test on `/api/activity/sync`; needs `LOAD_TEST_TOKEN` secret |
| `db-backup.yml` | dispatch + Sunday 03:00 UTC | Database backup |

## Web CI Rules

- `npm run lint` must return **zero errors** — warnings are OK but errors fail the job
- `npm run build` must succeed (TypeScript compilation + Next.js static generation)
- Always run `npm run lint` and `npm run build` locally before pushing to avoid CI failures

## Desktop Release (v3 — current)

Do **not** hand-edit versions. release-please owns them.

```
1. Land Conventional Commits touching desktop-app-v3/  (feat: minor, fix: patch)
2. release-please.yml keeps a "release: <next-version>" PR open on main
3. Merge that PR → tags v3.x.y → desktop-v3-release.yml builds and publishes
```

## Legacy .NET Desktop Release Steps (dormant)

```
1. dotnet test                          # 94 xUnit tests must pass
2. dotnet publish -c Release            # self-contained win-x64 → ./publish/
3. iscc FlowShield-Setup.iss           # Inno Setup → desktop-app/installer/FlowShield-Setup-vX.Y.Z.exe
4. gh release create vX.Y.Z            # uploads installer as release asset
```

**Code signing (pending):** Windows Smart App Control blocks unsigned installers.
- Plan: SignPath Foundation (free OSS) — two signing steps to add:
  1. After `dotnet publish`: sign `./publish/FlowShield.exe`
  2. After Inno Setup: sign `desktop-app/installer/FlowShield-Setup-v*.exe`

## Legacy .NET Desktop Release Trigger (dormant)

```bash
# Bump version in:
#   desktop-app/FlowShield.Desktop.csproj  → <Version>X.Y.Z</Version>
#   desktop-app/FlowShield-Setup.iss       → #define AppVersion "X.Y.Z"
# Update RELEASE_NOTES.md, commit, then:
git tag vX.Y.Z
git push origin vX.Y.Z
```

## Netlify (Web Deployment)

- Auto-deploys `main` branch on every push
- Build command: `cd web-app && npm run build`
- Publish directory: `web-app/.next`
- `SECRETS_SCAN_OMIT_KEYS`: `NEXTAUTH_URL,PUSHER_KEY`
