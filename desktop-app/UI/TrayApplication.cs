using System;
using System.Drawing;
using System.Windows.Forms;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class TrayApplication : ApplicationContext
    {
        private readonly NotifyIcon _trayIcon;
        private readonly ActivityTracker _activityTracker;
        private readonly DatabaseService _dbService;
        private readonly ApiClient _apiClient;
        private readonly SyncService _syncService;
        private ContextMenuStrip? _contextMenu;

        public TrayApplication(ActivityTracker activityTracker, DatabaseService dbService)
        {
            _activityTracker = activityTracker;
            _dbService = dbService;
            _apiClient = new ApiClient(_dbService);
            _syncService = new SyncService(_apiClient, _dbService);

            // Subscribe to sync events
            _syncService.SyncCompleted += OnSyncCompleted;

            // Create system tray icon
            _trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application, // TODO: Replace with custom icon
                Text = "FlowShield - Tracking Active",
                Visible = true
            };

            BuildContextMenu();
            _trayIcon.ContextMenuStrip = _contextMenu;
            _trayIcon.DoubleClick += OnTrayIconDoubleClick;

            // Check if authenticated
            if (_apiClient.IsAuthenticated())
            {
                _syncService.Start();
                ShowNotification("FlowShield Started", "Activity tracking is active");
            }
            else
            {
                ShowLoginDialog();
            }
        }

        private void BuildContextMenu()
        {
            _contextMenu = new ContextMenuStrip();

            // Status
            var statusItem = new ToolStripMenuItem
            {
                Text = _activityTracker.IsTracking ? "✓ Tracking Active" : "✗ Tracking Paused",
                Enabled = false
            };
            _contextMenu.Items.Add(statusItem);
            _contextMenu.Items.Add(new ToolStripSeparator());

            // Toggle Tracking
            var toggleItem = new ToolStripMenuItem
            {
                Text = _activityTracker.IsTracking ? "Pause Tracking" : "Resume Tracking"
            };
            toggleItem.Click += ToggleTracking;
            _contextMenu.Items.Add(toggleItem);

            // Sync Now
            var syncItem = new ToolStripMenuItem { Text = "Sync Now" };
            syncItem.Click += async (s, e) => await _syncService.SyncNowAsync();
            _contextMenu.Items.Add(syncItem);

            _contextMenu.Items.Add(new ToolStripSeparator());

            // Today's Stats
            var statsItem = new ToolStripMenuItem { Text = "Today's Stats" };
            statsItem.Click += ShowStats;
            _contextMenu.Items.Add(statsItem);

            // Settings
            var settingsItem = new ToolStripMenuItem { Text = "Settings" };
            settingsItem.Click += ShowSettings;
            _contextMenu.Items.Add(settingsItem);

            _contextMenu.Items.Add(new ToolStripSeparator());

            // Login/Logout
            var authItem = new ToolStripMenuItem
            {
                Text = _apiClient.IsAuthenticated() ? "Logout" : "Login"
            };
            authItem.Click += ToggleAuth;
            _contextMenu.Items.Add(authItem);

            // Exit
            var exitItem = new ToolStripMenuItem { Text = "Exit" };
            exitItem.Click += Exit;
            _contextMenu.Items.Add(exitItem);
        }

        private void ToggleTracking(object? sender, EventArgs e)
        {
            if (_activityTracker.IsTracking)
            {
                _activityTracker.Stop();
                _trayIcon.Text = "FlowShield - Tracking Paused";
                ShowNotification("Tracking Paused", "Activity tracking has been paused");
            }
            else
            {
                _activityTracker.Start();
                _trayIcon.Text = "FlowShield - Tracking Active";
                ShowNotification("Tracking Resumed", "Activity tracking has been resumed");
            }

            BuildContextMenu();
            _trayIcon.ContextMenuStrip = _contextMenu;
        }

        private void ShowStats(object? sender, EventArgs e)
        {
            var stats = _dbService.GetTodayStats();
            var hours = stats["TotalSeconds"] / 3600.0;

            var message = $"Today's Activity:\n\n" +
                         $"Total Time: {hours:F1} hours\n" +
                         $"Activity Logs: {stats["TotalLogs"]}\n" +
                         $"Unique Apps: {stats["UniqueApps"]}";

            MessageBox.Show(message, "Today's Stats", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void ShowSettings(object? sender, EventArgs e)
        {
            var settingsForm = new SettingsForm(_dbService, _apiClient);
            settingsForm.ShowDialog();
        }

        private void ToggleAuth(object? sender, EventArgs e)
        {
            if (_apiClient.IsAuthenticated())
            {
                var result = MessageBox.Show(
                    "Are you sure you want to logout?",
                    "Confirm Logout",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );

                if (result == DialogResult.Yes)
                {
                    _apiClient.Logout();
                    _syncService.Stop();
                    ShowNotification("Logged Out", "You have been logged out");
                    BuildContextMenu();
                    _trayIcon.ContextMenuStrip = _contextMenu;
                }
            }
            else
            {
                ShowLoginDialog();
            }
        }

        private void ShowLoginDialog()
        {
            var loginForm = new LoginForm(_apiClient, _syncService);
            if (loginForm.ShowDialog() == DialogResult.OK)
            {
                ShowNotification("Logged In", "Successfully connected to FlowShield");
                BuildContextMenu();
                _trayIcon.ContextMenuStrip = _contextMenu;
            }
        }

        private void OnTrayIconDoubleClick(object? sender, EventArgs e)
        {
            ShowStats(sender, e);
        }

        private void OnSyncCompleted(object? sender, SyncEventArgs e)
        {
            if (e.Success && e.RemainingUnsyncedCount == 0)
            {
                Console.WriteLine($"Sync completed successfully at {e.Timestamp}");
            }
        }

        private void ShowNotification(string title, string message)
        {
            _trayIcon.BalloonTipTitle = title;
            _trayIcon.BalloonTipText = message;
            _trayIcon.BalloonTipIcon = ToolTipIcon.Info;
            _trayIcon.ShowBalloonTip(3000);
        }

        private void Exit(object? sender, EventArgs e)
        {
            _activityTracker.Stop();
            _syncService.Stop();
            _trayIcon.Visible = false;
            Application.Exit();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _trayIcon?.Dispose();
                _contextMenu?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
