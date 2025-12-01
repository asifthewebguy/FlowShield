using System;
using System.Drawing;
using System.Linq;
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
        private readonly NotificationService _notificationService;
        private readonly WebsiteBlocker _websiteBlocker;
        private ContextMenuStrip? _contextMenu;

        public TrayApplication(ActivityTracker activityTracker, DatabaseService dbService)
        {
            _activityTracker = activityTracker;
            _dbService = dbService;
            _apiClient = new ApiClient(_dbService);
            _syncService = new SyncService(_apiClient, _dbService);
            _websiteBlocker = new WebsiteBlocker();

            // Create system tray icon
            _trayIcon = new NotifyIcon
            {
                Icon = LoadIcon(),
                Text = "FlowShield - Tracking Active",
                Visible = true
            };

            // Initialize notification service
            _notificationService = new NotificationService(_trayIcon, _dbService);

            // Subscribe to events
            SubscribeToEvents();

            BuildContextMenu();
            _trayIcon.ContextMenuStrip = _contextMenu;
            _trayIcon.DoubleClick += OnTrayIconDoubleClick;

            // Check if authenticated
            if (_apiClient.IsAuthenticated())
            {
                _syncService.Start();
                _notificationService.ShowInfo("FlowShield Started", "Activity tracking is active");

                // Register device and load user preferences
                RegisterDeviceAndLoadPreferencesAsync();
            }
            else
            {
                ShowLoginDialog();
            }
        }

        private void SubscribeToEvents()
        {
            // Activity Tracker events
            _activityTracker.TrackingStarted += OnTrackingStarted;
            _activityTracker.TrackingStopped += OnTrackingStopped;
            _activityTracker.IdleStateChanged += OnIdleStateChanged;
            _activityTracker.ActivityLogged += OnActivityLogged;

            // Sync Service events
            _syncService.SyncStarted += OnSyncStarted;
            _syncService.SyncCompleted += OnSyncCompleted;
            _syncService.SyncFailed += OnSyncFailed;
        }

        private Icon LoadIcon()
        {
            try
            {
                // Try to load custom icon from logo.ico file
                var iconPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logo.ico");
                if (System.IO.File.Exists(iconPath))
                {
                    return new Icon(iconPath);
                }
            }
            catch (Exception)
            {
                // Fall back to system icon if loading fails
            }

            return SystemIcons.Application;
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

            // Website Blocking
            if (_apiClient.IsAuthenticated())
            {
                // Check the actual blocking state from the hosts file
                var actuallyBlocking = _websiteBlocker.IsBlocking();

                // Sync the database setting with the actual state
                _dbService.SaveSetting("WebsiteBlockingEnabled", actuallyBlocking ? "true" : "false");

                var blockItem = new ToolStripMenuItem
                {
                    Text = actuallyBlocking ? "✓ Block Distracting Sites" : "Block Distracting Sites",
                    Checked = actuallyBlocking
                };
                blockItem.Click += ToggleWebsiteBlocking;
                _contextMenu.Items.Add(blockItem);
                _contextMenu.Items.Add(new ToolStripSeparator());
            }

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
            }
            else
            {
                _activityTracker.Start();
                _trayIcon.Text = "FlowShield - Tracking Active";
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
                    _notificationService.NotifyLogout();
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
                _notificationService.NotifyLoginSuccess();
                BuildContextMenu();
                _trayIcon.ContextMenuStrip = _contextMenu;

                // Register device and load preferences after successful login
                RegisterDeviceAndLoadPreferencesAsync();
            }
        }

        private void OnTrayIconDoubleClick(object? sender, EventArgs e)
        {
            ShowStats(sender, e);
        }

        // Event handlers
        private void OnTrackingStarted(object? sender, EventArgs e)
        {
            _notificationService.NotifyTrackingStarted();
        }

        private void OnTrackingStopped(object? sender, EventArgs e)
        {
            _notificationService.NotifyTrackingPaused();
        }

        private void OnIdleStateChanged(object? sender, IdleStateChangedEventArgs e)
        {
            if (e.IsIdle)
            {
                _notificationService.NotifyIdleDetected(e.IdleMinutes);
            }
            else
            {
                _notificationService.NotifyActivityResumed();
            }
        }

        private void OnActivityLogged(object? sender, ActivityLoggedEventArgs e)
        {
            // Optional: Notify on high productivity
            if (e.ActivityLevel >= 80)
            {
                _notificationService.NotifyHighProductivity();
            }
        }

        private void OnSyncStarted(object? sender, SyncEventArgs e)
        {
            if (e.RemainingUnsyncedCount > 0)
            {
                _notificationService.NotifySyncStarted();
            }
        }

        private void OnSyncCompleted(object? sender, SyncEventArgs e)
        {
            _notificationService.NotifySyncCompleted(e.SyncedCount, e.RemainingUnsyncedCount);
        }

        private void OnSyncFailed(object? sender, SyncEventArgs e)
        {
            _notificationService.NotifySyncFailed(e.ErrorMessage ?? "Unknown error");
        }

        private async void RegisterDeviceAndLoadPreferencesAsync()
        {
            try
            {
                // Register this device with the server
                await _apiClient.RegisterDeviceAsync();

                // Load user preferences
                var preferences = await _apiClient.GetUserPreferencesAsync();
                if (preferences != null && preferences.PrimaryDistractions != null)
                {
                    // Setup website blocker with user's distractions
                    _websiteBlocker.SetBlockedDistractions(preferences.PrimaryDistractions);

                    // Check if blocking was previously enabled
                    var blockingEnabled = _dbService.GetSetting("WebsiteBlockingEnabled") == "true";
                    if (blockingEnabled && _websiteBlocker.IsRunningAsAdministrator())
                    {
                        _websiteBlocker.EnableBlocking();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading user preferences: {ex.Message}");
            }
        }

        private void ToggleWebsiteBlocking(object? sender, EventArgs e)
        {
            try
            {
                if (!_websiteBlocker.IsRunningAsAdministrator())
                {
                    MessageBox.Show(
                        "Administrator privileges are required to block websites.\n\n" +
                        "Please restart FlowShield as Administrator to use this feature.",
                        "Administrator Required",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                    return;
                }

                var currentlyBlocking = _websiteBlocker.IsBlocking();

                if (currentlyBlocking)
                {
                    // Disable blocking - Ask for confirmation
                    var blockedDomains = _websiteBlocker.GetBlockedDomains();
                    var result = MessageBox.Show(
                        $"Website blocking is currently active for {blockedDomains.Count} websites.\n\n" +
                        "Do you want to disable website blocking and allow access to all sites?",
                        "Disable Website Blocking",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question
                    );

                    if (result == DialogResult.Yes)
                    {
                        try
                        {
                            if (_websiteBlocker.DisableBlocking())
                            {
                                _dbService.SaveSetting("WebsiteBlockingEnabled", "false");
                                _notificationService.ShowInfo("Website Blocking Disabled", "You can now access all websites");
                                BuildContextMenu();
                                _trayIcon.ContextMenuStrip = _contextMenu;
                            }
                            else
                            {
                                MessageBox.Show(
                                    "Failed to disable website blocking. The hosts file may be in use or you may need to restart as Administrator.",
                                    "Error",
                                    MessageBoxButtons.OK,
                                    MessageBoxIcon.Error
                                );
                            }
                        }
                        catch (Exception ex)
                        {
                            MessageBox.Show(
                                $"Error disabling website blocking: {ex.Message}",
                                "Error",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Error
                            );
                        }
                    }
                }
                else
                {
                    // Enable blocking
                    var blockedDomains = _websiteBlocker.GetBlockedDomains();
                    if (blockedDomains.Count == 0)
                    {
                        MessageBox.Show(
                            "No distracting websites configured.\n\n" +
                            "Please update your distraction preferences on the web app first.",
                            "No Distractions Configured",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                        return;
                    }

                    var result = MessageBox.Show(
                        $"This will block {blockedDomains.Count} distracting websites based on your preferences.\n\n" +
                        "Examples: " + string.Join(", ", blockedDomains.Take(3)) +
                        (blockedDomains.Count > 3 ? "..." : "") + "\n\n" +
                        "Do you want to enable website blocking?",
                        "Enable Website Blocking",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question
                    );

                    if (result == DialogResult.Yes)
                    {
                        if (_websiteBlocker.EnableBlocking())
                        {
                            _dbService.SaveSetting("WebsiteBlockingEnabled", "true");
                            _notificationService.ShowSuccess("Website Blocking Enabled",
                                $"Blocking {blockedDomains.Count} distracting websites");
                            BuildContextMenu();
                            _trayIcon.ContextMenuStrip = _contextMenu;
                        }
                        else
                        {
                            MessageBox.Show(
                                "Failed to enable website blocking. Check logs for details.",
                                "Error",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Error
                            );
                        }
                    }
                }
            }
            catch (UnauthorizedAccessException ex)
            {
                MessageBox.Show(
                    ex.Message,
                    "Permission Denied",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Error toggling website blocking: {ex.Message}",
                    "Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private void Exit(object? sender, EventArgs e)
        {
            _activityTracker.Stop();
            _syncService.Stop();

            // Disable website blocking on exit
            try
            {
                if (_websiteBlocker.IsBlocking() && _websiteBlocker.IsRunningAsAdministrator())
                {
                    _websiteBlocker.DisableBlocking();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error disabling website blocking on exit: {ex.Message}");
            }

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
