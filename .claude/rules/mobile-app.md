---
description: Mobile app stack, screens, offline queue, usage tracking — Expo SDK 54 React Native
globs: mobile-app/**
alwaysApply: false
---

# Mobile App (`mobile-app/`)

## Stack

- **Expo SDK 54**, React Native 0.81.5, TypeScript
- **Auth:** `SecureStore` for JWT persistence; `src/lib/auth.tsx` React context + provider
- **Navigation:** 5-tab bottom nav via `src/navigation/AppNavigator.tsx`
- **Notifications:** Expo Notifications — session reminders, completion alerts
- **Offline:** `src/lib/offlineQueue.ts` — `syncWithFallback()` wraps all `/api/activity/sync` calls; queued items re-sent on next successful request
- **Usage tracking:** `AppState`-based phone usage monitoring during focus sessions → synced as `source: "mobile"`
- **Theme:** `src/lib/theme.ts` — shared colors/spacing matching web brand (sky-500 primary)

## Key Files

| File | Purpose |
|------|---------|
| `App.tsx` | Root, auth provider, navigator |
| `src/navigation/AppNavigator.tsx` | 5-tab bottom nav + native stack |
| `src/lib/api.ts` | Typed API client with SecureStore token persistence |
| `src/lib/auth.tsx` | Auth context; auto-restores session on launch |
| `src/lib/offlineQueue.ts` | Activity sync offline queue |
| `src/lib/notifications.ts` | Expo push notification helpers |
| `src/lib/usageTracker.ts` | AppState-based phone usage recording |

## Screens (6 tabs)

`LoginScreen` · `DashboardScreen` · `TimerScreen` · `HistoryScreen` · `TasksScreen` · `AnalyticsScreen` · `ProfileScreen` · `SettingsScreen`

## API Integration

Uses existing web API endpoints — no mobile-specific backend:
- Auth: `/api/auth/login`
- Sessions: `/api/sessions`, `/api/sessions/active`
- Analytics: `/api/analytics`
- Activity sync: `/api/activity/sync` with `source: "mobile"`
- Tasks: `getTasks()` → `/api/tasks`

## Run

```bash
cd mobile-app
npm start        # Expo Go — scan QR code with phone
npm run android  # Android emulator
```
