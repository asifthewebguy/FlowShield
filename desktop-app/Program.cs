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
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetHighDpiMode(HighDpiMode.SystemAware);

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
    }
}
