using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using FlowShield.Desktop.Services;
using Newtonsoft.Json.Linq;
using Serilog;

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
        private readonly ApplicationBlocker _appBlocker;
        private readonly SessionManager _sessionManager;
        private ContextMenuStrip? _contextMenu;
        private MainWindow? _mainWindow;
        private AnalyticsWindow? _analyticsWindow;
        private GoalsWindow? _goalsWindow;
        private ProjectsWindow? _projectsWindow;
        private CoachWindow? _coachWindow;
        private LeaderboardWindow? _leaderboardWindow;
        private TeamsWindow? _teamsWindow;
        private SessionHistoryWindow? _sessionHistoryWindow;
        private PusherService? _pusherService;
        private readonly CategoryService _categoryService;
        private bool _notifiedFiveMin = false;
        private bool _notifiedOneMin = false;

        public TrayApplication(ActivityTracker activityTracker, DatabaseService dbService)
        {
            _activityTracker = activityTracker;
            _dbService = dbService;

            // 1. Create Tray Icon first (needed for notifications)
            _trayIcon = new NotifyIcon();

            // 2. Initialize Services
            _apiClient = new ApiClient(_dbService);
            _syncService = new SyncService(_apiClient, _dbService);
            _notificationService = new NotificationService(_trayIcon, _dbService);
            _websiteBlocker = new WebsiteBlocker();
            _appBlocker = new ApplicationBlocker();

            // 3. Initialize SessionManager (needs NotificationService and Blockers)
            _sessionManager = new SessionManager(_apiClient, _activityTracker, _notificationService, _websiteBlocker, _appBlocker);
            _sessionManager.TimerTick += (s, time) =>
            {
                // Live countdown in tray tooltip
                _trayIcon.Text = $"FlowShield — {time.ToString(@"mm\:ss")} remaining";

                // 5-minute warning
                if (!_notifiedFiveMin && time.TotalMinutes <= 5.0 && time.TotalMinutes > 1.0)
                {
                    _notifiedFiveMin = true;
                    _notificationService.ShowInfo("5 Minutes Left", "Your focus session ends in 5 minutes.");
                }
                // 1-minute warning
                if (!_notifiedOneMin && time.TotalMinutes <= 1.0 && time.TotalSeconds > 0)
                {
                    _notifiedOneMin = true;
                    _notificationService.ShowInfo("1 Minute Left", "Final minute — wrap up and save your work!");
                }
            };
            _sessionManager.SessionStarted += OnSessionStarted;
            _sessionManager.SessionEnded += OnSessionEnded;
            _sessionManager.SessionPaused += OnSessionPauseStateChanged;
            _sessionManager.SessionResumed += OnSessionPauseStateChanged;

            // 4b. Initialize CategoryService and wire to ActivityTracker
            _categoryService = new CategoryService(_apiClient, _dbService);
            _activityTracker.CategoryService = _categoryService;

            // 4. Configure Tray Icon
            _trayIcon.Icon = LoadIcon();
            _trayIcon.Text = "FlowShield - Tracking Active";
            _trayIcon.Visible = true;
            _trayIcon.DoubleClick += OnTrayIconDoubleClick;

            // 5. Initialize Session State
            _ = _sessionManager.InitializeAsync();

            // Subscribe to events
            SubscribeToEvents();

            BuildContextMenu();
            _trayIcon.ContextMenuStrip = _contextMenu;

            // Check if authenticated
            if (_apiClient.IsAuthenticated())
            {
                _syncService.Start();
                _notificationService.ShowInfo("FlowShield Started", "Activity tracking is active");

                // Register device and load user preferences
                RegisterDeviceAndLoadPreferencesAsync();
            }
            // If cancelled, app remains in tray — user can right-click → Sign In later.
        }

        /// <summary>
        /// Runs <paramref name="action"/> when the user is authenticated;
        /// otherwise shows the login dialog so they can sign in first.
        /// </summary>
        private void RequireAuth(Action action)
        {
            if (_apiClient.IsAuthenticated())
                action();
            else
                ShowLoginDialog();
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

            // Api Client events
            _apiClient.SessionExpired += OnSessionExpired;
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

            _contextMenu.Items.Add(new ToolStripSeparator());

            // Show Widget
            var showWidgetItem = new ToolStripMenuItem { Text = "Show Widget" };
            showWidgetItem.Click += (s, e) => RequireAuth(ShowMainWindow);
            _contextMenu.Items.Add(showWidgetItem);

            // View Analytics
            var analyticsItem = new ToolStripMenuItem { Text = "View Analytics" };
            analyticsItem.Click += (s, e) => RequireAuth(ShowAnalyticsWindow);
            _contextMenu.Items.Add(analyticsItem);

            // Goals
            var goalsItem = new ToolStripMenuItem { Text = "Goals" };
            goalsItem.Click += (s, e) => RequireAuth(ShowGoalsWindow);
            _contextMenu.Items.Add(goalsItem);

            // Projects
            var projectsItem = new ToolStripMenuItem { Text = "Projects" };
            projectsItem.Click += (s, e) => RequireAuth(ShowProjectsWindow);
            _contextMenu.Items.Add(projectsItem);

            // AI Coach
            var coachItem = new ToolStripMenuItem { Text = "✨ AI Coach" };
            coachItem.Click += (s, e) => RequireAuth(ShowCoachWindow);
            _contextMenu.Items.Add(coachItem);

            // Leaderboard
            var leaderboardItem = new ToolStripMenuItem { Text = "🏆 Leaderboard" };
            leaderboardItem.Click += (s, e) => RequireAuth(ShowLeaderboardWindow);
            _contextMenu.Items.Add(leaderboardItem);

            // Teams
            var teamsItem = new ToolStripMenuItem { Text = "👥 My Teams" };
            teamsItem.Click += (s, e) => RequireAuth(ShowTeamsWindow);
            _contextMenu.Items.Add(teamsItem);

            // Session History
            var historyItem = new ToolStripMenuItem { Text = "🕐 Session History" };
            historyItem.Click += (s, e) => RequireAuth(ShowSessionHistoryWindow);
            _contextMenu.Items.Add(historyItem);

            // Start Focus Session — grouped by session type
            var startSessionItem = new ToolStripMenuItem { Text = "Start Focus Session" };

            // Work
            var workItem = new ToolStripMenuItem { Text = "💼 Work" };
            foreach (var (label, min) in new[] { ("25 Minutes", 25), ("45 Minutes", 45), ("60 Minutes", 60) })
            {
                var item = new ToolStripMenuItem { Text = label };
                var m = min;
                item.Click += async (s, e) => { if (_apiClient.IsAuthenticated()) await _sessionManager.StartSessionAsync(m, "WORK"); else ShowLoginDialog(); };
                workItem.DropDownItems.Add(item);
            }
            startSessionItem.DropDownItems.Add(workItem);

            // Study
            var studyItem = new ToolStripMenuItem { Text = "📚 Study" };
            foreach (var (label, min) in new[] { ("25 Minutes", 25), ("45 Minutes", 45), ("90 Minutes", 90) })
            {
                var item = new ToolStripMenuItem { Text = label };
                var m = min;
                item.Click += async (s, e) => { if (_apiClient.IsAuthenticated()) await _sessionManager.StartSessionAsync(m, "STUDY"); else ShowLoginDialog(); };
                studyItem.DropDownItems.Add(item);
            }
            startSessionItem.DropDownItems.Add(studyItem);

            // Creative
            var creativeItem = new ToolStripMenuItem { Text = "🎨 Creative" };
            foreach (var (label, min) in new[] { ("45 Minutes", 45), ("90 Minutes", 90), ("120 Minutes", 120) })
            {
                var item = new ToolStripMenuItem { Text = label };
                var m = min;
                item.Click += async (s, e) => { if (_apiClient.IsAuthenticated()) await _sessionManager.StartSessionAsync(m, "CREATIVE"); else ShowLoginDialog(); };
                creativeItem.DropDownItems.Add(item);
            }
            startSessionItem.DropDownItems.Add(creativeItem);

            _contextMenu.Items.Add(startSessionItem);

            // Pause / Resume / Stop — only when a session is active
            if (_sessionManager.IsRunning)
            {
                if (_sessionManager.IsPaused)
                {
                    var resumeItem = new ToolStripMenuItem { Text = "▶ Resume Session" };
                    resumeItem.Click += async (s, e) => await _sessionManager.ResumeSessionAsync();
                    _contextMenu.Items.Add(resumeItem);
                }
                else
                {
                    var pauseItem = new ToolStripMenuItem { Text = "⏸ Pause Session" };
                    pauseItem.Click += async (s, e) => await _sessionManager.PauseSessionAsync();
                    _contextMenu.Items.Add(pauseItem);
                }

                var stopItem = new ToolStripMenuItem { Text = "⏹ Stop Session" };
                stopItem.Click += async (s, e) => await _sessionManager.StopSessionAsync();
                _contextMenu.Items.Add(stopItem);
            }

            _contextMenu.Items.Add(new ToolStripSeparator());

            // Toggle Tracking
            var toggleItem = new ToolStripMenuItem
            {
                Text = _activityTracker.IsTracking ? "Pause Tracking" : "Resume Tracking"
            };
            toggleItem.Click += (s, e) => RequireAuth(() => ToggleTracking(s, e));
            _contextMenu.Items.Add(toggleItem);

            // Sync Now
            var syncItem = new ToolStripMenuItem { Text = "Sync Now" };
            syncItem.Click += async (s, e) => { if (_apiClient.IsAuthenticated()) await _syncService.SyncNowAsync(); else ShowLoginDialog(); };
            _contextMenu.Items.Add(syncItem);

            _contextMenu.Items.Add(new ToolStripSeparator());

            // Today's Stats
            var statsItem = new ToolStripMenuItem { Text = "Today's Stats" };
            statsItem.Click += (s, e) => RequireAuth(() => ShowStats(s, e));
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
            var settingsForm = new SettingsForm(_dbService, _apiClient, _notificationService);
            settingsForm.ShowDialog();
        }

        private void OnSessionStarted(object? sender, SessionInfo session)
        {
            _notifiedFiveMin = false;
            _notifiedOneMin  = false;
            BuildContextMenu();
            _trayIcon.ContextMenuStrip = _contextMenu;
            ShowMainWindow();
        }

        private void OnSessionEnded(object? sender, EventArgs e)
        {
            _trayIcon.Text = "FlowShield - Tracking Active";
            BuildContextMenu();
            _trayIcon.ContextMenuStrip = _contextMenu;
        }

        private void OnSessionPauseStateChanged(object? sender, EventArgs e)
        {
            BuildContextMenu();
            _trayIcon.ContextMenuStrip = _contextMenu;
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
                    DisconnectPusher();
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
            var loginForm = new LoginForm(_apiClient, _syncService, _dbService);
            if (loginForm.ShowDialog() == DialogResult.OK)
            {
                _notificationService.NotifyLoginSuccess();
                BuildContextMenu();
                _trayIcon.ContextMenuStrip = _contextMenu;

                // Register device and load preferences after successful login
                RegisterDeviceAndLoadPreferencesAsync();

                // Start background session polling and pick up any active session
                _ = _sessionManager.InitializeAsync();
            }
        }

        private void OnTrayIconDoubleClick(object? sender, EventArgs e)
        {
            ShowMainWindow();
        }

        private void ShowMainWindow()
        {
            if (_mainWindow == null || !_mainWindow.IsLoaded)
            {
                _mainWindow = new MainWindow(_sessionManager);
                _mainWindow.Show();
            }
            else
            {
                _mainWindow.Show();
                if (_mainWindow.WindowState == System.Windows.WindowState.Minimized)
                    _mainWindow.WindowState = System.Windows.WindowState.Normal;
                _mainWindow.Activate();
            }
        }

        private void ShowGoalsWindow()
        {
            if (_goalsWindow == null || !_goalsWindow.IsLoaded)
            {
                _goalsWindow = new GoalsWindow(_apiClient);
                _goalsWindow.Show();
            }
            else
            {
                _goalsWindow.Show();
                if (_goalsWindow.WindowState == System.Windows.WindowState.Minimized)
                    _goalsWindow.WindowState = System.Windows.WindowState.Normal;
                _goalsWindow.Activate();
            }
        }

        private void ShowProjectsWindow()
        {
            if (_projectsWindow == null || !_projectsWindow.IsLoaded)
            {
                _projectsWindow = new ProjectsWindow(_apiClient);
                _projectsWindow.Show();
            }
            else
            {
                _projectsWindow.Show();
                if (_projectsWindow.WindowState == System.Windows.WindowState.Minimized)
                    _projectsWindow.WindowState = System.Windows.WindowState.Normal;
                _projectsWindow.Activate();
            }
        }

        private void ShowCoachWindow()
        {
            if (_coachWindow == null || !_coachWindow.IsLoaded)
            {
                _coachWindow = new CoachWindow(_apiClient);
                _coachWindow.Show();
            }
            else
            {
                _coachWindow.Show();
                if (_coachWindow.WindowState == System.Windows.WindowState.Minimized)
                    _coachWindow.WindowState = System.Windows.WindowState.Normal;
                _coachWindow.Activate();
            }
        }

        private void ShowLeaderboardWindow()
        {
            if (_leaderboardWindow == null || !_leaderboardWindow.IsLoaded)
            {
                _leaderboardWindow = new LeaderboardWindow(_apiClient);
                _leaderboardWindow.Show();
            }
            else
            {
                _leaderboardWindow.Show();
                if (_leaderboardWindow.WindowState == System.Windows.WindowState.Minimized)
                    _leaderboardWindow.WindowState = System.Windows.WindowState.Normal;
                _leaderboardWindow.Activate();
            }
        }

        private void ShowSessionHistoryWindow()
        {
            if (_sessionHistoryWindow == null || !_sessionHistoryWindow.IsLoaded)
            {
                _sessionHistoryWindow = new SessionHistoryWindow(_apiClient);
                _sessionHistoryWindow.Show();
            }
            else
            {
                _sessionHistoryWindow.Show();
                if (_sessionHistoryWindow.WindowState == System.Windows.WindowState.Minimized)
                    _sessionHistoryWindow.WindowState = System.Windows.WindowState.Normal;
                _sessionHistoryWindow.Activate();
            }
        }

        private void ShowTeamsWindow()
        {
            if (_teamsWindow == null || !_teamsWindow.IsLoaded)
            {
                _teamsWindow = new TeamsWindow(_apiClient);
                _teamsWindow.Show();
            }
            else
            {
                _teamsWindow.Show();
                if (_teamsWindow.WindowState == System.Windows.WindowState.Minimized)
                    _teamsWindow.WindowState = System.Windows.WindowState.Normal;
                _teamsWindow.Activate();
            }
        }

        private void ShowAnalyticsWindow()
        {
            if (_analyticsWindow == null || !_analyticsWindow.IsLoaded)
            {
                _analyticsWindow = new AnalyticsWindow(_apiClient);
                _analyticsWindow.Show();
            }
            else
            {
                _analyticsWindow.Show();
                if (_analyticsWindow.WindowState == System.Windows.WindowState.Minimized)
                    _analyticsWindow.WindowState = System.Windows.WindowState.Normal;
                _analyticsWindow.Activate();
            }
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

        private DateTime _lastProductivityNotificationTime = DateTime.MinValue;

        private void OnActivityLogged(object? sender, ActivityLoggedEventArgs e)
        {
            // Optional: Notify on high productivity
            // Rate limit to once every 30 minutes to avoid spamming
            if (e.ActivityLevel >= 80 && (DateTime.Now - _lastProductivityNotificationTime).TotalMinutes >= 30)
            {
                _notificationService.NotifyHighProductivity();
                _lastProductivityNotificationTime = DateTime.Now;
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

        private void OnSessionExpired(object? sender, EventArgs e)
        {
            _syncService.Stop();
            _notificationService.NotifyLogout(); // Or a specific session expired notification
            BuildContextMenu();
            _trayIcon.ContextMenuStrip = _contextMenu;
        }

        private async void ConnectPusherAsync()
        {
            var userId = _dbService.GetSetting("UserId");
            if (string.IsNullOrEmpty(userId)) return;

            var pusherKey     = ReadAppSetting("PusherKey");
            var pusherCluster = ReadAppSetting("PusherCluster");
            if (string.IsNullOrEmpty(pusherKey) || string.IsNullOrEmpty(pusherCluster)) return;

            _pusherService?.Dispose();
            _pusherService = new PusherService(pusherKey, pusherCluster);
            _pusherService.SessionUpdateReceived += (_, _) => _ = _sessionManager.TriggerResyncAsync();
            await _pusherService.ConnectAsync(userId);
        }

        private void DisconnectPusher()
        {
            _pusherService?.Dispose();
            _pusherService = null;
        }

        private static string ReadAppSetting(string key)
        {
            try
            {
                var path = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
                if (!File.Exists(path)) return string.Empty;
                var obj = JObject.Parse(File.ReadAllText(path));
                return obj[key]?.ToString() ?? string.Empty;
            }
            catch { return string.Empty; }
        }

        private async void RegisterDeviceAndLoadPreferencesAsync()
        {
            try
            {
                // Register this device with the server
                await _apiClient.RegisterDeviceAsync();

                // Sync category rules (stale check is inside LoadAsync)
                await _categoryService.LoadAsync();

                // SessionManager now handles active session check on init

                // Load user preferences
                var preferences = await _apiClient.GetUserPreferencesAsync();
                if (preferences != null && preferences.PrimaryDistractions != null)
                {
                    // Setup website + app blockers with user's distraction preferences
                    _websiteBlocker.SetBlockedDistractions(preferences.PrimaryDistractions);
                    _appBlocker.SetBlockedDistractions(preferences.PrimaryDistractions);

                    // Merge any user-defined custom blocked apps on top of distraction preferences
                    var customApps = _dbService.GetSetting("CustomBlockedApps");
                    if (!string.IsNullOrEmpty(customApps))
                    {
                        var customs = customApps.Split(',', StringSplitOptions.RemoveEmptyEntries)
                            .Select(a => a.Trim())
                            .Where(a => a.Length > 0)
                            .ToList();
                        if (customs.Count > 0)
                            _appBlocker.AddCustomApps(customs);
                    }

                    // Check if blocking was previously enabled
                    var blockingEnabled = _dbService.GetSetting("WebsiteBlockingEnabled") == "true";
                    if (blockingEnabled && _websiteBlocker.IsRunningAsAdministrator())
                    {
                        _websiteBlocker.EnableBlocking();
                    }
                }

                // Connect to Pusher for real-time cross-device session events
                ConnectPusherAsync();
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to register device or load preferences");
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

            // Flush any remaining activities before exit — run on thread pool to avoid
            // deadlocking the UI thread. Cap at 5 s so exit always completes.
            try
            {
                Task.Run(() => _syncService.SyncNowAsync()).Wait(TimeSpan.FromSeconds(5));
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to flush sync on exit");
            }

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
                Log.Warning(ex, "Failed to disable website blocking on exit");
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
                _mainWindow?.Close();
                _analyticsWindow?.Close();
                _goalsWindow?.Close();
                _projectsWindow?.Close();
                _coachWindow?.Close();
                _leaderboardWindow?.Close();
                _teamsWindow?.Close();
                _sessionHistoryWindow?.Close();
                _pusherService?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
