using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class HistoryRowViewModel
    {
        public string DateText { get; set; } = "";
        public string TypeText { get; set; } = "";
        public string PlannedText { get; set; } = "";
        public string ActualText { get; set; } = "";
        public string StatusText { get; set; } = "";
        public Brush StatusBackground { get; set; } = Brushes.Transparent;
        public Brush StatusForeground { get; set; } = Brushes.White;

        public static HistoryRowViewModel From(SessionInfo s)
        {
            // Date + time
            var local = s.StartTime.ToLocalTime();
            var dateText = local.ToString("ddd MMM d, h:mm tt");

            // Session type
            var type = s.SessionType ?? "WORK";
            var typeText = type switch
            {
                "STUDY"    => "📚 Study",
                "CREATIVE" => "🎨 Creative",
                _          => "💼 Work",
            };

            // Durations
            var plannedText = FormatMinutes(s.PlannedDuration);

            string actualText;
            if (s.EndTime.HasValue)
            {
                var actual = (int)(s.EndTime.Value - s.StartTime).TotalMinutes;
                actualText = actual > 0 ? FormatMinutes(actual) : "—";
            }
            else
            {
                actualText = s.Completed ? plannedText : "—";
            }

            // Status
            string statusLabel;
            Brush statusBg;
            Brush statusFg;

            if (s.Completed)
            {
                statusLabel = "Done";
                statusBg = new SolidColorBrush(Color.FromArgb(0x25, 0x10, 0xB9, 0x81));
                statusFg = new SolidColorBrush(Color.FromRgb(0x34, 0xD3, 0x99));
            }
            else if (s.IsPaused)
            {
                statusLabel = "Paused";
                statusBg = new SolidColorBrush(Color.FromArgb(0x25, 0xF5, 0x9E, 0x0B));
                statusFg = new SolidColorBrush(Color.FromRgb(0xFB, 0xBF, 0x24));
            }
            else if (s.EndTime == null)
            {
                statusLabel = "Active";
                statusBg = new SolidColorBrush(Color.FromArgb(0x25, 0x3B, 0x82, 0xF6));
                statusFg = new SolidColorBrush(Color.FromRgb(0x60, 0xA5, 0xFA));
            }
            else
            {
                statusLabel = "Stopped";
                statusBg = new SolidColorBrush(Color.FromArgb(0x20, 0xFF, 0xFF, 0xFF));
                statusFg = new SolidColorBrush(Color.FromRgb(0x6B, 0x72, 0x80));
            }

            return new HistoryRowViewModel
            {
                DateText         = dateText,
                TypeText         = typeText,
                PlannedText      = plannedText,
                ActualText       = actualText,
                StatusText       = statusLabel,
                StatusBackground = statusBg,
                StatusForeground = statusFg,
            };
        }

        private static string FormatMinutes(int minutes)
        {
            var h = minutes / 60;
            var m = minutes % 60;
            return h > 0 ? $"{h}h {m}m" : $"{m}m";
        }
    }

    public partial class SessionHistoryWindow : Window
    {
        private readonly ApiClient _apiClient;

        public SessionHistoryWindow(ApiClient apiClient)
        {
            InitializeComponent();
            _apiClient = apiClient;
        }

        protected override void OnContentRendered(EventArgs e)
        {
            base.OnContentRendered(e);
            _ = LoadHistoryAsync();
        }

        private async System.Threading.Tasks.Task LoadHistoryAsync()
        {
            RefreshBtn.IsEnabled   = false;
            LoadingText.Visibility = Visibility.Visible;
            EmptyText.Visibility   = Visibility.Collapsed;
            SessionList.ItemsSource = null;

            var sessions = await _apiClient.GetSessionHistoryAsync(limit: 30);

            LoadingText.Visibility = Visibility.Collapsed;
            RefreshBtn.IsEnabled   = true;

            if (sessions == null || sessions.Count == 0)
            {
                EmptyText.Visibility = Visibility.Visible;
                return;
            }

            var rows = new List<HistoryRowViewModel>();
            foreach (var s in sessions)
                rows.Add(HistoryRowViewModel.From(s));

            SessionList.ItemsSource = rows;
        }

        private void RefreshButton_Click(object sender, RoutedEventArgs e)
            => _ = LoadHistoryAsync();

        private void CloseButton_Click(object sender, RoutedEventArgs e) => Hide();

        private void DragWindow(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }
    }
}
