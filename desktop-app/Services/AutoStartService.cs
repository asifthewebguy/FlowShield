using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FlowShield.Desktop.Services
{
    public static class AutoStartService
    {
        private const string RegistryKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string AppName = "FlowShield";

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetCurrentPackageFullName(ref uint length, char[] name);

        /// <summary>
        /// Returns true when the process is running inside an MSIX package.
        /// Uses P/Invoke so no WinRT dependency is needed.
        /// </summary>
        private static bool IsRunningAsPackaged()
        {
            try { uint len = 0; return GetCurrentPackageFullName(ref len, null) != 15700; }
            catch { return false; }
        }

        /// <summary>
        /// Enables or disables auto-start with Windows.
        /// When running as an MSIX package the registry path is unavailable;
        /// startup is declared in Package.appxmanifest and toggled by Windows Settings.
        /// </summary>
        public static void SetAutoStart(bool enabled)
        {
            if (IsRunningAsPackaged())
                return; // Managed via Package.appxmanifest StartupTask + Windows Settings > Startup

            using var key = Registry.CurrentUser.OpenSubKey(RegistryKeyPath, writable: true);
            if (key == null) return;

            if (enabled)
            {
                key.SetValue(AppName, Application.ExecutablePath);
            }
            else
            {
                key.DeleteValue(AppName, throwOnMissingValue: false);
            }
        }

        /// <summary>
        /// Returns true if the FlowShield auto-start registry key exists.
        /// Always returns false when running as an MSIX package.
        /// </summary>
        public static bool IsAutoStartEnabled()
        {
            if (IsRunningAsPackaged())
                return false;

            using var key = Registry.CurrentUser.OpenSubKey(RegistryKeyPath, writable: false);
            if (key == null) return false;

            var value = key.GetValue(AppName);
            return value != null;
        }
    }
}
