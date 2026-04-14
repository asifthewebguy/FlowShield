using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public partial class MainWindow : Window
    {
        private readonly SessionManager _sessionManager;
        private readonly ApiClient _apiClient;
        private List<ProjectModel> _projects = new();

        public MainWindow(SessionManager sessionManager, ApiClient apiClient)
        {
            InitializeComponent();
            _sessionManager = sessionManager;
            _apiClient = apiClient;

            // Subscribe to events
            _sessionManager.TimerTick += OnTimerTick;
            _sessionManager.SessionStateChanged += OnSessionStateChanged;
            _sessionManager.SessionPaused += (s, e) => UpdateUI();
            _sessionManager.SessionResumed += (s, e) => UpdateUI();

            UpdateUI();
            _ = LoadProjectsAsync();
        }

        private async System.Threading.Tasks.Task LoadProjectsAsync()
        {
            try
            {
                var projects = await _apiClient.GetProjectsAsync();
                _projects = projects ?? new List<ProjectModel>();

                ProjectComboBox.Items.Clear();
                ProjectComboBox.Items.Add(new ComboBoxItem { Content = "— No Project —", Tag = null });
                foreach (var p in _projects)
                    ProjectComboBox.Items.Add(new ComboBoxItem { Content = p.Name, Tag = p.Id });
                ProjectComboBox.SelectedIndex = 0;
            }
            catch { /* silently ignore — project picker is optional */ }
        }

        private void ProjectComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e) { }

        private string? GetSelectedProjectId()
        {
            if (ProjectComboBox.SelectedItem is ComboBoxItem item && item.Tag is string id)
                return id;
            return null;
        }

        private void OnTimerTick(object? sender, TimeSpan remaining)
        {
            // timer runs on UI dispatcher because we used DispatcherTimer in manager
            TimerText.Text = remaining.ToString(@"mm\:ss");
        }

        private void OnSessionStateChanged(object? sender, bool isRunning)
        {
            UpdateUI();
        }

        private void UpdateUI()
        {
            // Sync Toggle State
            BlockingToggle.IsChecked = _sessionManager.BlockingEnabled;
            BlockingToggle.IsChecked = _sessionManager.BlockingEnabled;
            // BlockingToggle.IsEnabled = true; // Always allowed now

            if (_sessionManager.IsRunning)
            {
                if (_sessionManager.IsPaused)
                {
                    StartButton.Content = "Resume";
                    StartButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10B981")); // Green-500
                }
                else
                {
                    StartButton.Content = "Stop Session";
                    StartButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EF4444")); // Red-500
                }
                StatusText.Text = _sessionManager.IsPaused ? "Paused" : "Focusing...";
                StatusText.Foreground = new SolidColorBrush(_sessionManager.IsPaused
                    ? (Color)ColorConverter.ConvertFromString("#FBBF24")  // Amber-400
                    : (Color)ColorConverter.ConvertFromString("#60A5FA")); // Blue-400

                // Show session type badge
                var sessionType = _sessionManager.CurrentSession?.SessionType ?? "WORK";
                SessionTypeText.Text = sessionType switch
                {
                    "STUDY"    => "📚 Study",
                    "CREATIVE" => "🎨 Creative",
                    _          => "💼 Work",
                };
                SessionTypeBadge.Visibility = System.Windows.Visibility.Visible;
                StartPulseAnimation();
            }
            else
            {
                StartButton.Content = "Start Session";
                StartButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3B82F6")); // Blue-500
                TimerText.Text = _sessionManager.TimeRemaining.TotalSeconds > 0
                    ? _sessionManager.TimeRemaining.ToString(@"mm\:ss")
                    : "25:00";
                StatusText.Text = "Ready to Focus";
                StatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9CA3AF")); // Gray-400
                SessionTypeBadge.Visibility = System.Windows.Visibility.Collapsed;
                StopPulseAnimation();
            }
        }

        private void StartPulseAnimation()
        {
            var animation = new DoubleAnimation
            {
                From = 0.0,
                To = 0.5,
                Duration = new Duration(TimeSpan.FromSeconds(2)),
                AutoReverse = true,
                RepeatBehavior = RepeatBehavior.Forever
            };
            TimerGlow.BeginAnimation(UIElement.OpacityProperty, animation);
        }

        private void StopPulseAnimation()
        {
            TimerGlow.BeginAnimation(UIElement.OpacityProperty, null);
            TimerGlow.Opacity = 0;
        }

        private void DragWindow(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                this.DragMove();
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            this.Hide();
        }

        private async void StartToggle_Click(object sender, RoutedEventArgs e)
        {
            if (_sessionManager.IsRunning)
            {
                if (_sessionManager.IsPaused)
                    await _sessionManager.ResumeSessionAsync();
                else
                    await _sessionManager.StopSessionAsync();
            }
            else
            {
                await _sessionManager.StartSessionAsync(25, "WORK", GetSelectedProjectId());
            }
        }

        private void BlockingToggle_Checked(object sender, RoutedEventArgs e)
        {
            if (_sessionManager != null)
                _sessionManager.BlockingEnabled = true;
        }

        private void BlockingToggle_Unchecked(object sender, RoutedEventArgs e)
        {
            if (_sessionManager != null)
                _sessionManager.BlockingEnabled = false;
        }
    }
}
