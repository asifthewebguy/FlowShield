using System;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public partial class MainWindow : Window
    {
        private readonly SessionManager _sessionManager;

        public MainWindow(SessionManager sessionManager)
        {
            InitializeComponent();
            _sessionManager = sessionManager;

            // Subscribe to events
            _sessionManager.TimerTick += OnTimerTick;
            _sessionManager.SessionStateChanged += OnSessionStateChanged;

            UpdateUI();
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
                StartButton.Content = "Stop Session";
                StartButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EF4444")); // Red-500
                StatusText.Text = "Focusing...";
                StatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#60A5FA")); // Blue-400
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
                await _sessionManager.StopSessionAsync();
            }
            else
            {
                // Default to 25m for the quick widget
                await _sessionManager.StartSessionAsync(25);
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
