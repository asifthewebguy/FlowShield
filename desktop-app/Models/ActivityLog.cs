using System;

namespace FlowShield.Desktop.Models
{
    public class ActivityLog
    {
        public int Id { get; set; }
        public DateTime Timestamp { get; set; }
        public string WindowTitle { get; set; } = string.Empty;
        public string ProcessName { get; set; } = string.Empty;
        public string ApplicationName { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public int DurationSeconds { get; set; }
        public int ActivityLevel { get; set; } = 0; // 0-100 based on keyboard/mouse activity
        public bool IsSynced { get; set; }
        public string? UserId { get; set; }
        public string? SessionId { get; set; }
        public ActivityCategory Category { get; set; }
    }

    public enum ActivityCategory
    {
        Unknown = 0,
        Development = 1,
        Communication = 2,
        Entertainment = 3,
        Productivity = 4,
        Social = 5,
        Browsing = 6
    }
}
