using System;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FlowShield.Desktop.Services
{
    public static class AutoStartService
    {
        private const string RegistryKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string AppName = "FlowShield";

        /// <summary>
        /// Enables or disables auto-start with Windows by writing/removing a registry key.
        /// </summary>
        public static void SetAutoStart(bool enabled)
        {
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
        /// </summary>
        public static bool IsAutoStartEnabled()
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegistryKeyPath, writable: false);
            if (key == null) return false;

            var value = key.GetValue(AppName);
            return value != null;
        }
    }
}
