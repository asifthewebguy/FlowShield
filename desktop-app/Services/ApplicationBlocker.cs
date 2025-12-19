using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace FlowShield.Desktop.Services
{
    public class ApplicationBlocker
    {
        private readonly List<string> _blockedProcessNames = new();
        private CancellationTokenSource? _monitoringCts;
        private bool _isBlocking = false;

        // Default list of distracting apps (could be configurable later)
        private readonly List<string> _defaultDistractions = new()
        {
            "steam",
            "discord",
            "spotify",
            "battlenet",
            "origin",
            "epicgameslauncher",
            "whatsapp",
            "telegram",
            "skype",
            "slack"
        };

        public ApplicationBlocker()
        {
            // Initialize with defaults for now
            _blockedProcessNames.AddRange(_defaultDistractions);
        }

        public void SetBlockedApps(List<string> appNames)
        {
            _blockedProcessNames.Clear();
            _blockedProcessNames.AddRange(appNames.Select(n => n.ToLowerInvariant()));
        }

        public void BlockApps()
        {
            if (_isBlocking) return;
            _isBlocking = true;

            // 1. Initial Cleanup: Kill currently running instances
            KillBlockedProcesses();

            // 2. Start Monitoring: actively kill if they restart
            _monitoringCts = new CancellationTokenSource();
            _ = MonitorProcessesAsync(_monitoringCts.Token);
        }

        private void KillBlockedProcesses()
        {
            var processes = Process.GetProcesses();
            foreach (var process in processes)
            {
                try
                {
                    if (_blockedProcessNames.Contains(process.ProcessName.ToLowerInvariant()))
                    {
                        Console.WriteLine($"[Blocker] Killing {process.ProcessName}...");
                        process.Kill();
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Blocker] Failed to kill {process.ProcessName}: {ex.Message}");
                }
            }
        }

        private async Task MonitorProcessesAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                if (_isBlocking)
                {
                    KillBlockedProcesses();
                }

                // Check every 5 seconds to be less aggressive on CPU
                await Task.Delay(5000, token);
            }
        }

        public void UnblockApps()
        {
            _isBlocking = false;
            _monitoringCts?.Cancel();
            _monitoringCts = null;
        }

        public bool IsBlocking => _isBlocking;
    }
}
