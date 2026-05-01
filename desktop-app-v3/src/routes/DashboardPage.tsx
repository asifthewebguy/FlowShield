import { useAuthStore } from '../lib/auth';
import { Button } from '../components/Button';

/**
 * Placeholder dashboard. Phase 2 swaps this for the real session timer.
 */
export function DashboardPage() {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
        <div className="text-lg font-bold">
          Flow<span className="text-primary-500">Shield</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {user?.name ?? user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The timer + activity tracker arrive in the next slice (phase 2). For now,
              auth round-trips through the Rust backend and your token is persisted to the
              OS keychain.
            </p>
          </div>

          <div className="rounded-xl border border-surface-3 bg-surface-1 p-6 text-sm space-y-2">
            <div className="font-medium">Foundation status</div>
            <ul className="space-y-1 text-gray-600 dark:text-gray-400">
              <li>✓ Tauri 2 + React 19 + Tailwind</li>
              <li>✓ Login round-trips through Rust → /api/auth/login</li>
              <li>✓ Token persisted via tauri-plugin-store (keychain in phase 2)</li>
              <li>○ Phase 2 — session timer + active-session polling</li>
              <li>○ Phase 3 — activity tracking (active-win-pos-rs)</li>
              <li>○ Phase 4 — sync queue + tray + autostart + updater</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
