using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class ChatMessageViewModel : INotifyPropertyChanged
    {
        public bool IsUser { get; set; }

        private string _text = "";
        public string Text
        {
            get => _text;
            set
            {
                _text = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Text)));
            }
        }

        public Visibility CoachVisibility => IsUser ? Visibility.Collapsed : Visibility.Visible;
        public Visibility UserVisibility  => IsUser ? Visibility.Visible   : Visibility.Collapsed;

        public event PropertyChangedEventHandler? PropertyChanged;
    }

    public partial class CoachWindow : Window
    {
        private readonly ApiClient _apiClient;
        private readonly ObservableCollection<ChatMessageViewModel> _messages = new();
        private CancellationTokenSource? _streamCts;
        private ChatMessageViewModel? _currentCoachMsg;

        public CoachWindow(ApiClient apiClient)
        {
            InitializeComponent();
            _apiClient = apiClient;
            MessagesList.ItemsSource = _messages;
        }

        private async void SendButton_Click(object sender, RoutedEventArgs e)
            => await SendMessageAsync();

        private async void InputBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && !e.IsRepeat)
            {
                e.Handled = true;
                await SendMessageAsync();
            }
        }

        private async System.Threading.Tasks.Task SendMessageAsync()
        {
            var text = InputBox.Text.Trim();
            if (string.IsNullOrEmpty(text)) return;
            if (!_apiClient.IsAuthenticated())
            {
                ShowStatus("Not logged in. Please login first.", isError: true);
                return;
            }

            // Add user message
            InputBox.Text = "";
            _messages.Add(new ChatMessageViewModel { IsUser = true, Text = text });

            // Add empty coach message (will be filled via streaming)
            _currentCoachMsg = new ChatMessageViewModel { IsUser = false, Text = "" };
            _messages.Add(_currentCoachMsg);
            ScrollToBottom();

            // Switch to streaming mode
            SetStreamingState(true);

            _streamCts = new CancellationTokenSource();
            try
            {
                await _apiClient.GetCoachAdviceStreamAsync(
                    text,
                    context: null,
                    onChunk: chunk => Dispatcher.Invoke(() =>
                    {
                        if (_currentCoachMsg != null)
                            _currentCoachMsg.Text += chunk;
                        ScrollToBottom();
                    }),
                    ct: _streamCts.Token);
            }
            catch (OperationCanceledException)
            {
                if (_currentCoachMsg != null && string.IsNullOrEmpty(_currentCoachMsg.Text))
                    _currentCoachMsg.Text = "(stopped)";
            }
            catch (InvalidOperationException ex)
            {
                if (_currentCoachMsg != null)
                    _currentCoachMsg.Text = $"Error: {ex.Message}";
            }
            catch (Exception ex)
            {
                if (_currentCoachMsg != null)
                    _currentCoachMsg.Text = $"Could not reach AI Coach: {ex.Message}";
            }
            finally
            {
                _streamCts?.Dispose();
                _streamCts = null;
                _currentCoachMsg = null;
                SetStreamingState(false);
            }
        }

        private void StopButton_Click(object sender, RoutedEventArgs e)
        {
            _streamCts?.Cancel();
        }

        private void SetStreamingState(bool streaming)
        {
            SendBtn.IsEnabled = !streaming;
            InputBox.IsEnabled = !streaming;
            StopBtn.Visibility = streaming ? Visibility.Visible : Visibility.Collapsed;
            if (!streaming)
                HideStatus();
        }

        private void ShowStatus(string message, bool isError)
        {
            StatusText.Text       = message;
            StatusText.Foreground = isError
                ? System.Windows.Media.Brushes.Salmon
                : System.Windows.Media.Brushes.MediumSpringGreen;
            StatusText.Visibility = Visibility.Visible;
        }

        private void HideStatus()
        {
            StatusText.Visibility = Visibility.Collapsed;
        }

        private void ScrollToBottom()
        {
            ChatScroll.ScrollToEnd();
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            _streamCts?.Cancel();
            Hide();
        }

        private void DragWindow(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }
    }
}
