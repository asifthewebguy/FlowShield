using System;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace FlowShield.Desktop.UI
{
    public partial class SplashWindow : Window
    {
        private DispatcherTimer? _dotTimer;
        private int _dotState;

        public SplashWindow()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private void OnLoaded(object sender, RoutedEventArgs e)
        {
            // Show version
            var version = Assembly.GetExecutingAssembly().GetName().Version;
            VersionText.Text = version != null ? $"v{version.Major}.{version.Minor}.{version.Build}" : "v3.0.0";

            // Load logo from Assets folder next to the executable
            var logoPath = Path.Combine(AppContext.BaseDirectory, "Assets", "logo.png");
            if (File.Exists(logoPath))
            {
                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.UriSource = new Uri(logoPath, UriKind.Absolute);
                bitmap.DecodePixelWidth = 76;
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.EndInit();
                LogoImage.Source = bitmap;
            }

            // Animate loading dots
            _dotTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(280) };
            _dotTimer.Tick += (_, _) =>
            {
                _dotState = (_dotState + 1) % 3;
                Dot1.Opacity = _dotState == 0 ? 1.0 : _dotState == 2 ? 0.4 : 0.15;
                Dot2.Opacity = _dotState == 1 ? 1.0 : _dotState == 0 ? 0.4 : 0.15;
                Dot3.Opacity = _dotState == 2 ? 1.0 : _dotState == 1 ? 0.4 : 0.15;
            };
            _dotTimer.Start();
        }

        /// <summary>Updates the status label — call from any thread.</summary>
        public void SetStatus(string text)
        {
            Dispatcher.InvokeAsync(() => StatusText.Text = text);
        }

        protected override void OnClosed(EventArgs e)
        {
            _dotTimer?.Stop();
            base.OnClosed(e);
        }

        // ── Static helpers ──────────────────────────────────────────────────

        private static SplashWindow? _instance;
        private static Dispatcher? _splashDispatcher;

        /// <summary>Shows the splash on a background STA thread so the main thread can initialise.</summary>
        public static void ShowSplash()
        {
            var ready = new ManualResetEventSlim();

            var thread = new Thread(() =>
            {
                _splashDispatcher = Dispatcher.CurrentDispatcher;
                _instance = new SplashWindow();
                ((System.Windows.Window)_instance).Show();
                ready.Set();
                Dispatcher.Run(); // pump messages on this thread
            });

            thread.SetApartmentState(ApartmentState.STA);
            thread.IsBackground = true;
            thread.Name = "SplashThread";
            thread.Start();

            ready.Wait(); // block until window is visible
        }

        /// <summary>Updates the splash status text from any thread.</summary>
        public static void SetStatusText(string text)
        {
            _splashDispatcher?.InvokeAsync(() => _instance?.SetStatus(text));
        }

        /// <summary>Closes the splash and shuts down its dispatcher.</summary>
        public static void CloseSplash()
        {
            _splashDispatcher?.Invoke(() =>
            {
                ((System.Windows.Window?)_instance)?.Close();
                _instance = null;
                Dispatcher.CurrentDispatcher.InvokeShutdown();
            });
            _splashDispatcher = null;
        }
    }
}
