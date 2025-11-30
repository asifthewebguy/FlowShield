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
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetHighDpiMode(HighDpiMode.SystemAware);

                // Add global exception handlers
                Application.ThreadException += Application_ThreadException;
                AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

                // Initialize database
                var dbService = new DatabaseService();
                dbService.Initialize();

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
