using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class GoalRowViewModel
    {
        private const double MaxBarWidth = 380;

        public string Label { get; set; } = "";
        public string ProgressText { get; set; } = "";
        public string SubText { get; set; } = "";
        public double ProgressBarWidth { get; set; }

        public static GoalRowViewModel From(GoalModel goal)
        {
            var label    = GoalTypeLabel(goal.GoalType);
            var current  = FormatValue(goal.GoalType, goal.CurrentValue);
            var target   = FormatValue(goal.GoalType, goal.TargetValue);
            var ratio    = goal.TargetValue > 0
                           ? Math.Min((double)goal.CurrentValue / goal.TargetValue, 1.0)
                           : 0;
            var subUnit  = SubUnitHint(goal.GoalType);

            return new GoalRowViewModel
            {
                Label            = label,
                ProgressText     = $"{current} / {target}",
                SubText          = $"Target: {target}{subUnit}  ·  Started {goal.StartDate.ToLocalTime():MMM d}",
                ProgressBarWidth = ratio * MaxBarWidth,
            };
        }

        private static string GoalTypeLabel(string t) => t switch
        {
            "DAILY_TIME"         => "Daily Focus Time",
            "WEEKLY_TIME"        => "Weekly Focus Time",
            "STREAK"             => "Streak",
            "PRODUCTIVITY_SCORE" => "Productivity Score",
            _                    => t,
        };

        private static string FormatValue(string type, int v) => type switch
        {
            "DAILY_TIME" or "WEEKLY_TIME" => v >= 60 ? $"{v / 60.0:F1}h" : $"{v}m",
            "STREAK"                      => $"{v} days",
            "PRODUCTIVITY_SCORE"          => $"{v}%",
            _                             => v.ToString(),
        };

        private static string SubUnitHint(string type) => type switch
        {
            "DAILY_TIME"         => "/day",
            "WEEKLY_TIME"        => "/week",
            "STREAK"             => "",
            "PRODUCTIVITY_SCORE" => "",
            _                    => "",
        };
    }

    public partial class GoalsWindow : Window
    {
        private readonly ApiClient _apiClient;

        public GoalsWindow(ApiClient apiClient)
        {
            InitializeComponent();
            _apiClient = apiClient;
        }

        protected override void OnContentRendered(EventArgs e)
        {
            base.OnContentRendered(e);
            _ = LoadGoalsAsync();
        }

        private async System.Threading.Tasks.Task LoadGoalsAsync()
        {
            RefreshBtn.IsEnabled = false;
            try
            {
                var goals = await _apiClient.GetGoalsAsync();
                RenderGoals(goals);
            }
            finally
            {
                RefreshBtn.IsEnabled = true;
            }
        }

        private void RenderGoals(List<GoalModel>? goals)
        {
            if (goals == null || goals.Count == 0)
            {
                GoalsList.ItemsSource = null;
                EmptyText.Visibility = Visibility.Visible;
                return;
            }

            EmptyText.Visibility = Visibility.Collapsed;
            var rows = new List<GoalRowViewModel>();
            foreach (var g in goals)
                rows.Add(GoalRowViewModel.From(g));

            GoalsList.ItemsSource = rows;
        }

        private async void SaveGoal_Click(object sender, RoutedEventArgs e)
        {
            if (GoalTypeCombo.SelectedItem is not ComboBoxItem selected)
                return;

            var typeTag = selected.Tag?.ToString() ?? "DAILY_TIME";
            if (!int.TryParse(TargetValueBox.Text.Trim(), out int target) || target < 1)
            {
                ShowStatus("Enter a valid target value (whole number > 0).", isError: true);
                return;
            }

            SaveGoalBtn.IsEnabled = false;
            GoalStatusText.Visibility = Visibility.Collapsed;
            try
            {
                var goal = await _apiClient.SetGoalAsync(typeTag, target);
                if (goal != null)
                {
                    ShowStatus("Goal saved!", isError: false);
                    await LoadGoalsAsync();
                }
            }
            catch (Exception ex)
            {
                ShowStatus($"Failed: {ex.Message}", isError: true);
            }
            finally
            {
                SaveGoalBtn.IsEnabled = true;
            }
        }

        private void ShowStatus(string message, bool isError)
        {
            GoalStatusText.Text       = message;
            GoalStatusText.Foreground = isError
                ? System.Windows.Media.Brushes.Salmon
                : System.Windows.Media.Brushes.MediumSpringGreen;
            GoalStatusText.Visibility = Visibility.Visible;
        }

        private void RefreshButton_Click(object sender, RoutedEventArgs e)
            => _ = LoadGoalsAsync();

        private void CloseButton_Click(object sender, RoutedEventArgs e)
            => Hide();

        private void DragWindow(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }
    }
}
