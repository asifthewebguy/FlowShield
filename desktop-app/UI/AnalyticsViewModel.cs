using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class DailyBarViewModel
    {
        /// <summary>Short day label, e.g. "Mon".</summary>
        public string Day { get; set; } = "";

        /// <summary>Pre-calculated pixel width for the fill bar (max 280).</summary>
        public double BarWidth { get; set; }

        /// <summary>Display text, e.g. "45m".</summary>
        public string Minutes { get; set; } = "";
    }

    public class SessionRowViewModel
    {
        public string Date { get; set; } = "";
        public string Duration { get; set; } = "";
        public string Type { get; set; } = "";
        public string Status { get; set; } = "";
        public Brush StatusBrush { get; set; } = Brushes.White;
    }

    public class AnalyticsViewModel : INotifyPropertyChanged
    {
        private const double MaxBarWidth = 280;

        public event PropertyChangedEventHandler? PropertyChanged;

        private string _totalFocusTime = "--";
        private string _completedSessions = "--";
        private string _completionRate = "--";
        private string _peakPeriod = "--";
        private string _lastUpdated = "";
        private bool _isLoading = false;
        private List<DailyBarViewModel> _dailyBars = new();
        private List<SessionRowViewModel> _recentSessions = new();

        public string TotalFocusTime    { get => _totalFocusTime;    set { _totalFocusTime    = value; OnPropertyChanged(); } }
        public string CompletedSessions { get => _completedSessions; set { _completedSessions = value; OnPropertyChanged(); } }
        public string CompletionRate    { get => _completionRate;    set { _completionRate    = value; OnPropertyChanged(); } }
        public string PeakPeriod        { get => _peakPeriod;        set { _peakPeriod        = value; OnPropertyChanged(); } }
        public string LastUpdated       { get => _lastUpdated;       set { _lastUpdated       = value; OnPropertyChanged(); } }
        public bool   IsLoading         { get => _isLoading;         set { _isLoading         = value; OnPropertyChanged(); } }

        public List<DailyBarViewModel>  DailyBars      { get => _dailyBars;       set { _dailyBars       = value; OnPropertyChanged(); } }
        public List<SessionRowViewModel> RecentSessions { get => _recentSessions; set { _recentSessions  = value; OnPropertyChanged(); } }

        public void PopulateFromAnalytics(AnalyticsData data)
        {
            var s = data.Summary;

            var hours = s.TotalFocusMinutes / 60.0;
            TotalFocusTime    = hours >= 1 ? $"{hours:F1}h" : $"{s.TotalFocusMinutes}m";
            CompletedSessions = $"{s.CompletedSessions}/{s.TotalSessions}";
            CompletionRate    = $"{s.CompletionRate}%";
            PeakPeriod        = Capitalize(data.PeakTimes?.PeakPeriod ?? "--");

            // Build bar chart — scale relative to the busiest day
            int maxMinutes = 1;
            foreach (var d in data.DailyStats)
                if (d.TotalMinutes > maxMinutes) maxMinutes = d.TotalMinutes;

            var bars = new List<DailyBarViewModel>();
            foreach (var d in data.DailyStats)
            {
                var day = DateTime.TryParse(d.Date, out var dt)
                    ? dt.ToString("ddd")
                    : d.Date;

                bars.Add(new DailyBarViewModel
                {
                    Day      = day,
                    BarWidth = (double)d.TotalMinutes / maxMinutes * MaxBarWidth,
                    Minutes  = d.TotalMinutes > 0 ? $"{d.TotalMinutes}m" : "0m",
                });
            }
            DailyBars = bars;

            LastUpdated = $"Updated {DateTime.Now:HH:mm}";
        }

        public void PopulateRecentSessions(List<SessionInfo> sessions)
        {
            var rows = new List<SessionRowViewModel>();
            foreach (var s in sessions)
            {
                Brush brush;
                string status;
                if (s.Completed)      { status = "Done";    brush = new SolidColorBrush(Color.FromRgb(0x10, 0xB9, 0x81)); }
                else if (s.IsPaused) { status = "Paused";  brush = new SolidColorBrush(Color.FromRgb(0xF5, 0x9E, 0x0B)); }
                else                  { status = "Running"; brush = new SolidColorBrush(Color.FromRgb(0x3B, 0x82, 0xF6)); }

                rows.Add(new SessionRowViewModel
                {
                    Date         = s.StartTime.ToLocalTime().ToString("MMM d, HH:mm"),
                    Duration     = $"{s.PlannedDuration}m",
                    Type         = Capitalize(s.SessionType ?? "WORK"),
                    Status       = status,
                    StatusBrush  = brush,
                });
            }
            RecentSessions = rows;
        }

        private static string Capitalize(string s)
            => string.IsNullOrEmpty(s) ? s : char.ToUpper(s[0]) + s.Substring(1).ToLower();

        private void OnPropertyChanged([CallerMemberName] string? name = null)
            => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
