using System;
using System.Windows.Forms;

namespace FlowShield.Desktop.Services
{
    public class NotificationService
    {
        private readonly NotifyIcon _notifyIcon;
        private readonly DatabaseService _dbService;
        private bool _notificationsEnabled = true;

        public NotificationService(NotifyIcon notifyIcon, DatabaseService dbService)
        {
            _notifyIcon = notifyIcon;
            _dbService = dbService;
            LoadSettings();
        }

        private void LoadSettings()
        {
            try
            {
                var showNotifications = _dbService.GetSetting("ShowNotifications");
                if (showNotifications != null && bool.TryParse(showNotifications, out bool enabled))
                {
                    _notificationsEnabled = enabled;
                }
            }
            catch (Exception)
            {
                // If settings can't be loaded, default to enabled
                _notificationsEnabled = true;
            }
        }

        public void SetEnabled(bool enabled)
        {
            _notificationsEnabled = enabled;
        }

        public void ShowNotification(string title, string message, ToolTipIcon icon = ToolTipIcon.Info)
        {
            if (!_notificationsEnabled) return;

            _notifyIcon.BalloonTipTitle = title;
            _notifyIcon.BalloonTipText = message;
            _notifyIcon.BalloonTipIcon = icon;
            _notifyIcon.ShowBalloonTip(3000);
        }

        public void ShowInfo(string title, string message)
        {
            ShowNotification(title, message, ToolTipIcon.Info);
        }

        public void ShowWarning(string title, string message)
        {
            ShowNotification(title, message, ToolTipIcon.Warning);
        }

        public void ShowError(string title, string message)
        {
            ShowNotification(title, message, ToolTipIcon.Error);
        }

        public void ShowSuccess(string title, string message)
        {
            ShowNotification(title, message, ToolTipIcon.Info);
        }

        // Specific notification types
        public void NotifyTrackingStarted()
        {
            ShowSuccess("Tracking Started", "Activity tracking is now active");
        }

        public void NotifyTrackingPaused()
        {
            ShowInfo("Tracking Paused", "Activity tracking has been paused");
        }

        public void NotifySyncStarted()
        {
            ShowInfo("Syncing", "Syncing activity data to cloud...");
        }

        public void NotifySyncCompleted(int count, int remaining)
        {
            if (remaining == 0)
            {
                ShowSuccess("Sync Complete", $"Successfully synced {count} activities");
            }
            else
            {
                ShowWarning("Sync Partial", $"Synced {count} activities, {remaining} remaining");
            }
        }

        public void NotifySyncFailed(string error)
        {
            ShowError("Sync Failed", $"Failed to sync: {error}");
        }

        public void NotifyIdleDetected(int idleMinutes)
        {
            ShowInfo("Idle Detected", $"No activity for {idleMinutes} minutes. Tracking paused.");
        }

        public void NotifyActivityResumed()
        {
            ShowSuccess("Activity Resumed", "User activity detected. Tracking resumed.");
        }

        public void NotifyLoginSuccess()
        {
            ShowSuccess("Logged In", "Successfully connected to FlowShield");
        }

        public void NotifyLoginFailed(string error)
        {
            ShowError("Login Failed", error);
        }

        public void NotifyLogout()
        {
            ShowInfo("Logged Out", "You have been logged out");
        }

        public void NotifyDailySummary(int sessions, double hours)
        {
            ShowInfo("Daily Summary", $"Today: {sessions} sessions, {hours:F1} hours of activity");
        }

        public void NotifyHighProductivity()
        {
            ShowSuccess("Great Work!", "You're having a highly productive session!");
        }

        public void NotifyLowActivity(int minutes)
        {
            ShowWarning("Low Activity", $"Activity level has been low for {minutes} minutes");
        }
    }

    public enum NotificationType
    {
        Info,
        Success,
        Warning,
        Error
    }
}
