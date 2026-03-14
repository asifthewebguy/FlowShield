using System;
using System.Threading;
using System.Windows;
using System.Windows.Input;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public partial class AnalyticsWindow : Window
    {
        private readonly ApiClient _apiClient;
        private readonly AnalyticsViewModel _vm = new();
        private string _currentPeriod = "week";
        private Timer? _refreshTimer;

        public AnalyticsWindow(ApiClient apiClient)
        {
            InitializeComponent();
            _apiClient = apiClient;
            DataContext = _vm;

            // Wire named TextBlocks to ViewModel (XAML bindings are on ItemsControls;
            // stat cards are updated via the ViewModel properties below)
            _vm.PropertyChanged += (_, e) =>
            {
                switch (e.PropertyName)
                {
                    case nameof(AnalyticsViewModel.TotalFocusTime):
                        TotalFocusText.Text = _vm.TotalFocusTime; break;
                    case nameof(AnalyticsViewModel.CompletedSessions):
                        SessionsText.Text   = _vm.CompletedSessions; break;
                    case nameof(AnalyticsViewModel.CompletionRate):
                        CompletionText.Text = _vm.CompletionRate; break;
                    case nameof(AnalyticsViewModel.PeakPeriod):
                        PeakText.Text       = _vm.PeakPeriod; break;
                    case nameof(AnalyticsViewModel.LastUpdated):
                        LastUpdatedText.Text = _vm.LastUpdated; break;
                    case nameof(AnalyticsViewModel.DailyBars):
                        BarsControl.ItemsSource = _vm.DailyBars; break;
                    case nameof(AnalyticsViewModel.RecentSessions):
                        SessionsControl.ItemsSource = _vm.RecentSessions; break;
                    case nameof(AnalyticsViewModel.IsLoading):
                        LoadingText.Visibility = _vm.IsLoading
                            ? Visibility.Visible : Visibility.Collapsed; break;
                }
            };
        }

        protected override void OnContentRendered(EventArgs e)
        {
            base.OnContentRendered(e);
            _ = LoadDataAsync();

            // Auto-refresh every 30 seconds while the window is open
            _refreshTimer = new Timer(_ => Dispatcher.Invoke(() => _ = LoadDataAsync()),
                null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
        }

        private async System.Threading.Tasks.Task LoadDataAsync()
        {
            _vm.IsLoading = true;
            try
            {
                var analyticsTask = _apiClient.GetAnalyticsAsync(_currentPeriod);
                var sessionsTask  = _apiClient.GetSessionHistoryAsync(8);

                await System.Threading.Tasks.Task.WhenAll(analyticsTask, sessionsTask);

                var analytics = await analyticsTask;
                var sessions  = await sessionsTask;

                if (analytics != null)
                    _vm.PopulateFromAnalytics(analytics);
                else
                    LastUpdatedText.Text = "Could not load analytics";

                if (sessions != null)
                    _vm.PopulateRecentSessions(sessions);
            }
            finally
            {
                _vm.IsLoading = false;
            }
        }

        private void PeriodButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not System.Windows.Controls.Button btn) return;
            _currentPeriod = btn.Tag?.ToString() ?? "week";

            // Swap styles to reflect the active tab
            BtnWeek.Style  = _currentPeriod == "week"
                ? (System.Windows.Style)Resources["PeriodTabActiveStyle"]
                : (System.Windows.Style)Resources["PeriodTabStyle"];
            BtnMonth.Style = _currentPeriod == "month"
                ? (System.Windows.Style)Resources["PeriodTabActiveStyle"]
                : (System.Windows.Style)Resources["PeriodTabStyle"];

            _ = LoadDataAsync();
        }

        private void RefreshButton_Click(object sender, RoutedEventArgs e)
            => _ = LoadDataAsync();

        private void CloseButton_Click(object sender, RoutedEventArgs e)
            => Hide();

        private void DragWindow(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                DragMove();
        }

        protected override void OnClosed(EventArgs e)
        {
            _refreshTimer?.Dispose();
            base.OnClosed(e);
        }
    }
}
