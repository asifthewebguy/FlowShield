using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using FlowShield.Desktop.Services;
using FlowShield.Desktop.UI;
using Newtonsoft.Json.Linq;
using Sentry;

namespace FlowShield.Desktop
{
    static class Program
    {
        private const string LegacyEncryptionKey = "FlowShield-Secure-Local-Storage-Key-2024";
        private static TrayApplication? _trayApp;
        private static WebsiteBlocker? _websiteBlocker;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetCurrentPackageFullName(ref uint length, char[] name);

        private static bool IsRunningAsPackaged()
        {
            try { uint len = 0; return GetCurrentPackageFullName(ref len, null) != 15700; }
            catch { return false; }
        }

        [STAThread]
        static void Main()
        {
            // 1. Check for Admin privileges (skip when running as MSIX — hosts-file writes are already guarded)
            if (!IsRunningAsPackaged() && !IsAdministrator())
            {
                // Restart as Admin
                try
                {
                    var startInfo = new System.Diagnostics.ProcessStartInfo();
                    startInfo.UseShellExecute = true;
                    startInfo.WorkingDirectory = Environment.CurrentDirectory;
                    startInfo.FileName = Application.ExecutablePath;
                    startInfo.Verb = "runas"; // Trigger UAC

                    System.Diagnostics.Process.Start(startInfo);
                    Application.Exit();
                    return;
                }
                catch (Exception)
                {
                    // User cancelled UAC
                    MessageBox.Show("FlowShield requires Administrator privileges to run.", "Permission Denied", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Application.Exit();
                    return;
                }
            }

            // Initialize file logging before anything else
            LoggingService.Initialize();

            // Read Sentry DSN from env var or appsettings.json (no more hardcoded DSN)
            var sentryDsn = GetSentryDsn();
            if (!string.IsNullOrEmpty(sentryDsn))
            {
                SentrySdk.Init(o =>
                {
                    o.Dsn = sentryDsn;
                    o.TracesSampleRate = 0.1;
                    o.IsGlobalModeEnabled = true;
                    var version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;
                    o.Release = $"flowshield-desktop@{version?.ToString(3) ?? "0.0.0"}";
                });
            }

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetHighDpiMode(HighDpiMode.SystemAware);

                // Add global exception handlers
                Application.ThreadException += Application_ThreadException;
                AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

                // Graceful shutdown handlers
                AppDomain.CurrentDomain.ProcessExit += OnProcessExit;
                Console.CancelKeyPress += OnCancelKeyPress;

                // Show splash while we initialise services
                SplashWindow.ShowSplash();

                // Initialize database with DPAPI-protected encryption key
                SplashWindow.SetStatusText("Initialising database");
                var dbService = new DatabaseService();
                var dbPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "FlowShield", "flowshield.db");

                // Migrate from legacy hardcoded key to DPAPI if needed
                if (File.Exists(dbPath) && !File.Exists(KeyProtectionService.KeyFilePath))
                {
                    try
                    {
                        KeyProtectionService.MigrateFromHardcodedKey(dbPath, LegacyEncryptionKey);
                        LoggingService.Logger.Information("Migrated database encryption from hardcoded key to DPAPI");
                    }
                    catch (Exception ex)
                    {
                        LoggingService.Logger.Warning(ex, "DPAPI migration failed — falling back to legacy key");
                    }
                }

                var encryptionKey = KeyProtectionService.GetOrCreateKey();
                dbService.Initialize(encryptionKey);

                // Recover any stale hosts file blocks left by a prior crash
                SplashWindow.SetStatusText("Checking system state");
                _websiteBlocker = new WebsiteBlocker();
                _websiteBlocker.RecoverStaleBlocks();

                // Start activity tracker
                SplashWindow.SetStatusText("Starting activity tracker");
                var activityTracker = new ActivityTracker(dbService);
                activityTracker.Start();

                // Check for updates in the background after startup
                var updateService = new UpdateService();
                _ = Task.Run(async () =>
                {
                    await Task.Delay(TimeSpan.FromSeconds(10));
                    await updateService.CheckAndPromptAsync();
                });

                // Create system tray application
                SplashWindow.SetStatusText("Ready");
                _trayApp = new TrayApplication(activityTracker, dbService);

                // Dismiss splash before entering the message loop
                SplashWindow.CloseSplash();

                Application.Run(_trayApp);
            }
            catch (Exception ex)
            {
                SplashWindow.CloseSplash();
                LoggingService.Logger.Fatal(ex, "Fatal error starting FlowShield");
                MessageBox.Show(
                    $"Fatal error starting FlowShield:\n\n{ex.Message}\n\nStack trace:\n{ex.StackTrace}",
                    "FlowShield Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            finally
            {
                LoggingService.Shutdown();
            }
        }

        private static string GetSentryDsn()
        {
            // 1. Check environment variable
            var envDsn = Environment.GetEnvironmentVariable("FLOWSHIELD_SENTRY_DSN");
            if (!string.IsNullOrEmpty(envDsn)) return envDsn;

            // 2. Check appsettings.json next to the executable
            try
            {
                var appSettingsPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
                if (File.Exists(appSettingsPath))
                {
                    var json = File.ReadAllText(appSettingsPath);
                    var obj = JObject.Parse(json);
                    var dsn = obj["SentryDsn"]?.ToString();
                    if (!string.IsNullOrEmpty(dsn)) return dsn;
                }
            }
            catch { }

            return string.Empty;
        }

        private static void OnProcessExit(object? sender, EventArgs e)
        {
            try
            {
                // Restore hosts file if blocking was active (crash-safe cleanup)
                if (_websiteBlocker != null && _websiteBlocker.HasStaleBlocks())
                {
                    _websiteBlocker.RecoverStaleBlocks();
                }
                LoggingService.Logger.Information("FlowShield process exiting — cleanup complete");
            }
            catch (Exception ex)
            {
                LoggingService.Logger.Warning(ex, "Error during process exit cleanup");
            }
        }

        private static void OnCancelKeyPress(object? sender, ConsoleCancelEventArgs e)
        {
            e.Cancel = true; // Prevent immediate termination; let ProcessExit run cleanup
            LoggingService.Logger.Information("CancelKeyPress received — initiating graceful shutdown");
            Application.Exit();
        }

        private static bool IsAdministrator()
        {
            var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            var principal = new System.Security.Principal.WindowsPrincipal(identity);
            return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        }

        private static void Application_ThreadException(object sender, System.Threading.ThreadExceptionEventArgs e)
        {
            LoggingService.Logger.Error(e.Exception, "Thread exception");
            SentrySdk.CaptureException(e.Exception);
            MessageBox.Show(
                $"Application error:\n\n{e.Exception.Message}\n\nStack trace:\n{e.Exception.StackTrace}",
                "FlowShield Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }

        private static void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            var exception = e.ExceptionObject as Exception;
            if (exception != null)
            {
                LoggingService.Logger.Fatal(exception, "Unhandled exception");
                SentrySdk.CaptureException(exception);
            }
            MessageBox.Show(
                $"Unhandled error:\n\n{exception?.Message}\n\nStack trace:\n{exception?.StackTrace}",
                "FlowShield Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
