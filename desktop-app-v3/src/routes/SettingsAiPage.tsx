import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { useAIStore } from '../lib/ai';
import { Button } from '../components/Button';

/**
 * Settings page for the Local AI substrate. Three sections:
 *  - Beta toggle (`ai.labs.enabled` flag)
 *  - Status (model id + ready/downloading/error + disk usage + chunk count)
 *  - Actions (Re-download, Delete AI data)
 */
export function SettingsAiPage() {
  const navigate = useNavigate();
  const settings = useAIStore((s) => s.settings);
  const downloadProgress = useAIStore((s) => s.downloadProgress);
  const refreshSettings = useAIStore((s) => s.refreshSettings);
  const setLabsEnabled = useAIStore((s) => s.setLabsEnabled);
  const preferGpu = useAIStore((s) => s.preferGpu);
  const gpuAvailable = useAIStore((s) => s.gpuAvailable);
  const setPreferGpu = useAIStore((s) => s.setPreferGpu);
  const refreshDevicePrefs = useAIStore((s) => s.refreshDevicePrefs);

  const [busy, setBusy] = useState<null | 'redownload' | 'delete'>(null);
  const [busyMessage, setBusyMessage] = useState<string>('');

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    void refreshDevicePrefs();
  }, [refreshDevicePrefs]);

  if (!settings) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  const diskMB = (settings.disk_usage_bytes / (1024 * 1024)).toFixed(1);

  const handleRedownload = async () => {
    setBusy('redownload');
    setBusyMessage('Starting download…');
    try {
      await invoke('ai_model_download_start');
      setBusyMessage('Download started — see status above.');
      await refreshSettings();
    } catch (e) {
      setBusyMessage(`Failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete all local AI data? This wipes embeddings, briefings, and model files.')) {
      return;
    }
    setBusy('delete');
    setBusyMessage('Deleting…');
    try {
      await invoke('ai_data_delete');
      setBusyMessage('Deleted.');
      await refreshSettings();
    } catch (e) {
      setBusyMessage(`Failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Local AI</h1>
        <Button variant="ghost" onClick={() => navigate('/')}>Back</Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Beta</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.labs_enabled}
            onChange={(e) => void setLabsEnabled(e.target.checked)}
          />
          <span className="text-sm text-gray-700">
            Enable Local AI (Beta) — runs Phi-3-mini + BGE-small entirely on this device
          </span>
        </label>
        <label
          className={`flex items-center gap-2${
            gpuAvailable ? '' : ' cursor-not-allowed opacity-50'
          }`}
        >
          <input
            type="checkbox"
            checked={gpuAvailable ? preferGpu : false}
            disabled={!gpuAvailable}
            onChange={(e) => void setPreferGpu(e.target.checked)}
          />
          <span className="text-sm text-gray-700">
            Use GPU when available —{' '}
            {gpuAvailable
              ? 'Runs AI on your NVIDIA GPU. Applies to your next briefing (full effect after restart).'
              : 'Requires the CUDA GPU build and an available NVIDIA GPU.'}
          </span>
        </label>
      </section>

      <section className="space-y-1 text-sm text-gray-700">
        <h2 className="text-sm font-medium text-gray-700">Status</h2>
        <div>Model: {settings.model_id}</div>
        <div>Embedder: {settings.embedder_id}</div>
        <div>Status: <span className="font-mono">{settings.status}</span></div>
        <div>Disk usage: {diskMB} MB</div>
        <div>Indexed chunks: {settings.indexed_chunk_count}</div>
        {settings.status === 'downloading' && downloadProgress && downloadProgress.total > 0 && (
          <div className="space-y-1 pt-1">
            <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
              <div
                className="h-full bg-primary-500 transition-all"
                style={{ width: `${Math.min(100, (downloadProgress.downloaded / downloadProgress.total) * 100)}%` }}
              />
            </div>
            <div className="font-mono text-xs text-gray-500">
              {(downloadProgress.downloaded / (1024 * 1024)).toFixed(0)} /{' '}
              {(downloadProgress.total / (1024 * 1024)).toFixed(0)} MB
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Actions</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleRedownload} disabled={busy !== null}>
            Re-download
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={busy !== null}>
            Delete AI data
          </Button>
        </div>
        {busyMessage && (
          <div className="text-xs text-gray-500">{busyMessage}</div>
        )}
      </section>
    </div>
  );
}
