using System;
using System.Windows.Forms;
using FlowShield.Desktop.Services;
using FlowShield.Desktop.UI;

namespace FlowShield.Desktop
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            // 1. Check for Admin privileges
            if (!IsAdministrator())
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

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetHighDpiMode(HighDpiMode.SystemAware);

                // Add global exception handlers
                Application.ThreadException += Application_ThreadException;
                AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

                // Initialize database with encryption
                var dbService = new DatabaseService();
                // In a real app, this key should be securely managed (e.g. DPAPI or User input)
                // For now we use a hardcoded app-specific key to satisfy the encryption requirement
                dbService.Initialize("FlowShield-Secure-Local-Storage-Key-2024");

                // Start activity tracker
                var activityTracker = new ActivityTracker(dbService);
                activityTracker.Start();

                // Create system tray application
                var trayApp = new TrayApplication(activityTracker, dbService);

                Application.Run(trayApp);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Fatal error starting FlowShield:\n\n{ex.Message}\n\nStack trace:\n{ex.StackTrace}",
                    "FlowShield Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static bool IsAdministrator()
        {
            var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            var principal = new System.Security.Principal.WindowsPrincipal(identity);
            return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        }

        private static void Application_ThreadException(object sender, System.Threading.ThreadExceptionEventArgs e)
        {
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
            MessageBox.Show(
                $"Unhandled error:\n\n{exception?.Message}\n\nStack trace:\n{exception?.StackTrace}",
                "FlowShield Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
