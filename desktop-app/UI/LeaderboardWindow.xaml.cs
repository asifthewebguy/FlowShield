using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class LeaderboardRowViewModel
    {
        public string RankText { get; set; } = "";
        public Brush RankForeground { get; set; } = Brushes.White;
        public Brush RowBackground { get; set; } = new SolidColorBrush(Color.FromArgb(0x0F, 0xFF, 0xFF, 0xFF));
        public Brush NameForeground { get; set; } = Brushes.White;
        public string DisplayName { get; set; } = "";
        public string FocusTimeText { get; set; } = "";
        public string StatsText { get; set; } = "";

        public static LeaderboardRowViewModel From(LeaderboardEntry entry)
        {
            var rankText = entry.Rank switch
            {
                1 => "🥇",
                2 => "🥈",
                3 => "🥉",
                _ => $"#{entry.Rank}"
            };

            Brush rankFg = entry.Rank <= 3
                ? Brushes.White
                : new SolidColorBrush(Color.FromRgb(0x6B, 0x72, 0x80));

            Brush rowBg = entry.IsCurrentUser
                ? new SolidColorBrush(Color.FromArgb(0x20, 0x3B, 0x82, 0xF6))
                : new SolidColorBrush(Color.FromArgb(0x0F, 0xFF, 0xFF, 0xFF));

            Brush nameFg = entry.IsCurrentUser
                ? new SolidColorBrush(Color.FromRgb(0x93, 0xC5, 0xFD))
                : Brushes.White;

            var displayName = entry.IsCurrentUser ? $"{entry.UserName} (you)" : entry.UserName;

            var hours = entry.TotalMinutes / 60;
            var mins  = entry.TotalMinutes % 60;
            var focusText = hours > 0 ? $"{hours}h {mins}m" : $"{mins}m";

            var statsText = $"{entry.SessionsCount} sessions";
            if (entry.Streak > 0)
                statsText += $" · {entry.Streak}🔥 streak";

            return new LeaderboardRowViewModel
            {
                RankText      = rankText,
                RankForeground = rankFg,
                RowBackground = rowBg,
                NameForeground = nameFg,
                DisplayName   = displayName,
                FocusTimeText = focusText,
                StatsText     = statsText,
            };
        }
    }

    public partial class LeaderboardWindow : Window
    {
        private readonly ApiClient _apiClient;
        private string _selectedPeriod = "week";

        public LeaderboardWindow(ApiClient apiClient)
        {
            InitializeComponent();
            _apiClient = apiClient;
        }

        protected override void OnContentRendered(EventArgs e)
        {
            base.OnContentRendered(e);
            _ = LoadDataAsync();
        }

        private async System.Threading.Tasks.Task LoadDataAsync()
        {
            RefreshBtn.IsEnabled = false;
            LoadingText.Visibility = Visibility.Visible;
            EmptyText.Visibility   = Visibility.Collapsed;
            LeaderboardList.ItemsSource = null;
            try
            {
                var data = await _apiClient.GetLeaderboardAsync(_selectedPeriod);
                RenderLeaderboard(data);
            }
            finally
            {
                RefreshBtn.IsEnabled = true;
                LoadingText.Visibility = Visibility.Collapsed;
            }
        }

        private void RenderLeaderboard(LeaderboardData? data)
        {
            if (data == null || data.Leaderboard.Count == 0)
            {
                LeaderboardList.ItemsSource = null;
                EmptyText.Visibility = Visibility.Visible;
                UserRankBadge.Visibility = Visibility.Collapsed;
                return;
            }

            if (data.UserRank > 0)
            {
                UserRankBadge.Text = $"Your rank: #{data.UserRank}";
                UserRankBadge.Visibility = Visibility.Visible;
            }
            else
            {
                UserRankBadge.Visibility = Visibility.Collapsed;
            }

            var rows = new List<LeaderboardRowViewModel>();
            foreach (var entry in data.Leaderboard)
                rows.Add(LeaderboardRowViewModel.From(entry));

            EmptyText.Visibility = Visibility.Collapsed;
            LeaderboardList.ItemsSource = rows;
        }

        private void PeriodButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not Button btn) return;
            _selectedPeriod = btn.Tag?.ToString() ?? "week";

            // Swap button styles
            BtnWeek.Style  = (Style)FindResource("PeriodTabStyle");
            BtnMonth.Style = (Style)FindResource("PeriodTabStyle");
            BtnAll.Style   = (Style)FindResource("PeriodTabStyle");
            btn.Style = (Style)FindResource("PeriodTabActiveStyle");

            _ = LoadDataAsync();
        }

        private void RefreshButton_Click(object sender, RoutedEventArgs e)
            => _ = LoadDataAsync();

        private void CloseButton_Click(object sender, RoutedEventArgs e)
            => Hide();

        private void DragWindow(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }
    }
}
