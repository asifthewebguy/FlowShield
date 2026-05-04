import { open } from '@tauri-apps/plugin-shell';
import { Button } from './Button';
import { useUpdateStore, selectShowBanner } from '../lib/update';

/**
 * Top-of-dashboard banner that appears when a newer release is available
 * AND the user installed via a direct-download channel (.AppImage / .deb /
 * .rpm / .dmg). For package-manager channels (AUR, Flatpak, Snap, Homebrew)
 * the prompt_style is `quiet` and this component renders null — those users
 * see only the tray menu badge and let their package manager handle it.
 *
 * Dismiss is in-memory only — re-appears on next launch if still applicable.
 * That's intentional: a missed update on a long-running app deserves another
 * nudge after a restart, but persistent dismiss could mask a critical fix.
 */
export function UpdateBanner() {
  const visible = useUpdateStore(selectShowBanner);
  const info = useUpdateStore((s) => s.available);
  const dismiss = useUpdateStore((s) => s.dismiss);

  if (!visible || !info) return null;

  const handleDownload = async () => {
    try {
      await open(info.release_url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[update] open url failed', err);
    }
  };

  return (
    <div className="bg-primary-500/10 border-b border-primary-500/30 px-3 py-2 flex items-center gap-2">
      <svg
        className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
      </svg>
      <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">
        <span className="font-medium">v{info.latest_version}</span> is available
      </span>
      <Button variant="primary" size="sm" onClick={handleDownload}>
        Download
      </Button>
      <button
        onClick={dismiss}
        className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-lg leading-none px-1.5"
        aria-label="Dismiss update notification"
        type="button"
      >
        ×
      </button>
    </div>
  );
}
