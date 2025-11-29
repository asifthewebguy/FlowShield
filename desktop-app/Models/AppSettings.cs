using System;

namespace FlowShield.Desktop.Models
{
    public class AppSettings
    {
        public string ApiBaseUrl { get; set; } = "http://localhost:3000";
        public string? AuthToken { get; set; }
        public string? UserId { get; set; }
        public bool TrackingEnabled { get; set; } = true;
        public int TrackingIntervalSeconds { get; set; } = 5;
        public int SyncIntervalMinutes { get; set; } = 5;
        public int IdleThresholdMinutes { get; set; } = 5;
        public bool TrackInputActivity { get; set; } = true;
        public bool StartWithWindows { get; set; } = true;
        public bool ShowNotifications { get; set; } = true;
        public DateTime? LastSyncTime { get; set; }
    }
}
