using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using FlowShield.Desktop.Models;
using FlowShield.Desktop.Interfaces;

namespace FlowShield.Desktop.Services
{
    public class ActivityTracker : IActivityTracker
    {
        private readonly DatabaseService _dbService;
        private readonly InputMonitor _inputMonitor;
        private System.Threading.Timer? _trackingTimer;
        private string _lastWindowTitle = string.Empty;
        private string _lastProcessName = string.Empty;
        private DateTime _lastActivityTime = DateTime.Now;
        private bool _isTracking = false;
        private bool _wasIdle = false;

        public bool IsTracking => _isTracking;

        // Events
        public event EventHandler? TrackingStarted;
        public event EventHandler? TrackingStopped;
        public event EventHandler<ActivityLoggedEventArgs>? ActivityLogged;
        public event EventHandler<IdleStateChangedEventArgs>? IdleStateChanged;

        public ActivityTracker(DatabaseService dbService)
        {
            _dbService = dbService;
            _inputMonitor = new InputMonitor();
        }

        public string? CurrentSessionId { get; set; }

        public void Start()
        {
            if (_isTracking) return;

            _isTracking = true;
            _inputMonitor.Start();
            _trackingTimer = new Timer(TrackActivity, null, TimeSpan.Zero, TimeSpan.FromSeconds(5));
            TrackingStarted?.Invoke(this, EventArgs.Empty);
        }

        public void Stop()
        {
            _isTracking = false;
            _inputMonitor.Stop();
            _trackingTimer?.Dispose();
            _trackingTimer = null;
            TrackingStopped?.Invoke(this, EventArgs.Empty);
        }




        public int GetIdleTimeSeconds()
        {
            return _inputMonitor.GetIdleTimeSeconds();
        }

        public InputActivityStats GetInputStats()
        {
            return _inputMonitor.GetActivityStats();
        }

        private void TrackActivity(object? state)
        {
            try
            {
                // Check if user is idle (no input for 5 minutes by default)
                bool isCurrentlyIdle = _inputMonitor.IsIdle();

                if (isCurrentlyIdle != _wasIdle)
                {
                    // Idle state changed
                    _wasIdle = isCurrentlyIdle;
                    var idleMinutes = _inputMonitor.GetIdleTimeSeconds() / 60;
                    IdleStateChanged?.Invoke(this, new IdleStateChangedEventArgs
                    {
                        IsIdle = isCurrentlyIdle,
                        IdleMinutes = idleMinutes
                    });
                }

                if (isCurrentlyIdle)
                {
                    Debug.WriteLine("User is idle, skipping activity tracking");
                    return;
                }

                var windowTitle = GetActiveWindowTitle();
                var processName = GetActiveProcessName();

                if (string.IsNullOrEmpty(windowTitle) || string.IsNullOrEmpty(processName))
                    return;

                // If window or process changed, log the previous activity
                if (windowTitle != _lastWindowTitle || processName != _lastProcessName)
                {
                    if (!string.IsNullOrEmpty(_lastWindowTitle))
                    {
                        var duration = (int)(DateTime.Now - _lastActivityTime).TotalSeconds;
                        if (duration > 0)
                        {
                            // Get input activity stats for activity level
                            var inputStats = _inputMonitor.GetActivityStats();

                            var log = new ActivityLog
                            {
                                Timestamp = _lastActivityTime,
                                WindowTitle = _lastWindowTitle,
                                ProcessName = _lastProcessName,
                                ApplicationName = GetApplicationName(_lastProcessName),
                                Url = ExtractUrl(_lastWindowTitle, _lastProcessName),
                                DurationSeconds = duration,
                                Category = CategorizeActivity(_lastProcessName, _lastWindowTitle),
                                ActivityLevel = inputStats.GetActivityLevel(),
                                SessionId = CurrentSessionId
                            };

                            _dbService.LogActivity(log);

                            // Raise event
                            ActivityLogged?.Invoke(this, new ActivityLoggedEventArgs
                            {
                                Log = log,
                                ActivityLevel = inputStats.GetActivityLevel()
                            });
                        }
                    }

                    _lastWindowTitle = windowTitle;
                    _lastProcessName = processName;
                    _lastActivityTime = DateTime.Now;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Error tracking activity: {ex.Message}");
            }
        }

        internal ActivityCategory CategorizeActivity(string processName, string windowTitle)
        {
            var process = processName.ToLower();
            var title = windowTitle.ToLower();

            // Development tools
            if (process.Contains("code") || process.Contains("studio") ||
                process.Contains("rider") || process.Contains("eclipse") ||
                title.Contains("visual studio") || title.Contains("vscode"))
                return ActivityCategory.Development;

            // Communication
            if (process.Contains("slack") || process.Contains("teams") ||
                process.Contains("discord") || process.Contains("outlook") ||
                process.Contains("thunderbird") || title.Contains("gmail"))
                return ActivityCategory.Communication;

            // Browsers (check URL/title for more specific categorization)
            if (process.Contains("chrome") || process.Contains("firefox") ||
                process.Contains("edge") || process.Contains("brave"))
            {
                if (title.Contains("youtube") || title.Contains("netflix") ||
                    title.Contains("twitch") || title.Contains("spotify"))
                    return ActivityCategory.Entertainment;

                if (title.Contains("facebook") || title.Contains("twitter") ||
                    title.Contains("instagram") || title.Contains("linkedin") ||
                    title.Contains("reddit"))
                    return ActivityCategory.Social;

                if (title.Contains("github") || title.Contains("stackoverflow") ||
                    title.Contains("docs.") || title.Contains("documentation"))
                    return ActivityCategory.Development;

                return ActivityCategory.Browsing;
            }

            // Productivity tools
            if (process.Contains("excel") || process.Contains("word") ||
                process.Contains("powerpoint") || process.Contains("notion") ||
                process.Contains("onenote") || process.Contains("evernote"))
                return ActivityCategory.Productivity;

            return ActivityCategory.Unknown;
        }

        private string GetApplicationName(string processName)
        {
            var knownApps = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "chrome", "Google Chrome" },
                { "firefox", "Mozilla Firefox" },
                { "msedge", "Microsoft Edge" },
                { "code", "Visual Studio Code" },
                { "devenv", "Visual Studio" },
                { "slack", "Slack" },
                { "teams", "Microsoft Teams" },
                { "outlook", "Microsoft Outlook" },
                { "excel", "Microsoft Excel" },
                { "word", "Microsoft Word" },
                { "powerpnt", "Microsoft PowerPoint" },
                { "notion", "Notion" },
                { "discord", "Discord" },
                { "spotify", "Spotify" }
            };

            foreach (var kvp in knownApps)
            {
                if (processName.ToLower().Contains(kvp.Key.ToLower()))
                    return kvp.Value;
            }

            return processName;
        }

        private string ExtractUrl(string windowTitle, string processName)
        {
            // Try to extract URL from browser window titles
            if (processName.ToLower().Contains("chrome") ||
                processName.ToLower().Contains("firefox") ||
                processName.ToLower().Contains("edge"))
            {
                // Common pattern: "Page Title - Website Name"
                // Try to extract domain from title
                var parts = windowTitle.Split('-', '|', '·');
                if (parts.Length > 1)
                {
                    var lastPart = parts[^1].Trim();
                    if (lastPart.Contains("youtube", StringComparison.OrdinalIgnoreCase))
                        return "youtube.com";
                    if (lastPart.Contains("github", StringComparison.OrdinalIgnoreCase))
                        return "github.com";
                    // Add more URL extraction logic as needed
                }
            }

            return string.Empty;
        }

        // Windows API imports for getting active window
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        private string GetActiveWindowTitle()
        {
            const int nChars = 256;
            var buff = new StringBuilder(nChars);
            var handle = GetForegroundWindow();

            if (GetWindowText(handle, buff, nChars) > 0)
            {
                return buff.ToString();
            }

            return string.Empty;
        }

        private string GetActiveProcessName()
        {
            try
            {
                var handle = GetForegroundWindow();
                GetWindowThreadProcessId(handle, out uint processId);

                var process = Process.GetProcessById((int)processId);
                return process.ProcessName;
            }
            catch
            {
                return string.Empty;
            }
        }
    }

    public class ActivityLoggedEventArgs : EventArgs
    {
        public ActivityLog Log { get; set; } = null!;
        public int ActivityLevel { get; set; }
    }

    public class IdleStateChangedEventArgs : EventArgs
    {
        public bool IsIdle { get; set; }
        public int IdleMinutes { get; set; }
    }
}
