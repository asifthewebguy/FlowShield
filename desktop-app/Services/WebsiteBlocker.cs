using FlowShield.Desktop.Interfaces;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Serilog;

namespace FlowShield.Desktop.Services
{
    public class WebsiteBlocker : IWebsiteBlocker
    {
        private readonly string _hostsFilePath;
        private readonly string _backupPath;
        private readonly string _blockMarker = "# FlowShield Block";
        private List<string> _blockedDomains = new();
        private bool _isBlocking = false;

        // Mapping of distraction types to website domains
        private readonly Dictionary<string, string[]> _distractionDomains = new()
        {
            { "Social Media", new[] {
                "facebook.com", "www.facebook.com", "m.facebook.com",
                "twitter.com", "www.twitter.com", "x.com", "www.x.com",
                "instagram.com", "www.instagram.com",
                "linkedin.com", "www.linkedin.com",
                "reddit.com", "www.reddit.com",
                "tiktok.com", "www.tiktok.com",
                "snapchat.com", "www.snapchat.com",
                "pinterest.com", "www.pinterest.com"
            }},
            { "Video Streaming", new[] {
                "youtube.com", "www.youtube.com", "m.youtube.com",
                "netflix.com", "www.netflix.com",
                "hulu.com", "www.hulu.com",
                "twitch.tv", "www.twitch.tv",
                "vimeo.com", "www.vimeo.com"
            }},
            { "Email", new[] {
                "gmail.com", "mail.google.com",
                "outlook.com", "outlook.live.com",
                "yahoo.com", "mail.yahoo.com",
                "protonmail.com", "mail.protonmail.com"
            }},
            { "Messaging", new[] {
                "messenger.com", "www.messenger.com",
                "web.whatsapp.com",
                "web.telegram.org",
                "discord.com", "www.discord.com",
                "slack.com", "app.slack.com"
            }},
            { "News Sites", new[] {
                "news.google.com",
                "cnn.com", "www.cnn.com",
                "bbc.com", "www.bbc.com",
                "reddit.com", "www.reddit.com",
                "buzzfeed.com", "www.buzzfeed.com"
            }},
            { "Shopping", new[] {
                "amazon.com", "www.amazon.com",
                "ebay.com", "www.ebay.com",
                "aliexpress.com", "www.aliexpress.com",
                "walmart.com", "www.walmart.com",
                "target.com", "www.target.com"
            }}
        };

        public WebsiteBlocker()
        {
            _hostsFilePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "drivers", "etc", "hosts"
            );
            _backupPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FlowShield", "hosts.backup"
            );
        }

        /// <summary>Test-only constructor with injectable file paths.</summary>
        internal WebsiteBlocker(string hostsFilePath, string backupPath)
        {
            _hostsFilePath = hostsFilePath;
            _backupPath = backupPath;
        }

        public bool IsRunningAsAdministrator()
        {
            try
            {
                var identity = WindowsIdentity.GetCurrent();
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetCurrentPackageFullName(ref uint length, char[] name);

        private static bool IsRunningAsPackaged()
        {
            try { uint len = 0; return GetCurrentPackageFullName(ref len, null) != 15700; }
            catch { return false; }
        }

        public void SetBlockedDistractions(List<string> distractionTypes)
        {
            _blockedDomains.Clear();

            foreach (var distractionType in distractionTypes)
            {
                if (_distractionDomains.ContainsKey(distractionType))
                {
                    _blockedDomains.AddRange(_distractionDomains[distractionType]);
                }
            }
        }

        /// <summary>
        /// Creates a backup of the hosts file before modification.
        /// Backup is stored at %LOCALAPPDATA%\FlowShield\hosts.backup.
        /// </summary>
        public void BackupHostsFile()
        {
            try
            {
                var dir = Path.GetDirectoryName(_backupPath);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                File.Copy(_hostsFilePath, _backupPath, overwrite: true);
                Log.Debug("Hosts file backed up to {Path}", _backupPath);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to backup hosts file to {Path}", _backupPath);
            }
        }

        /// <summary>Checks if the hosts file contains stale FlowShield markers.</summary>
        internal bool HasStaleBlocks()
        {
            try
            {
                if (!File.Exists(_hostsFilePath)) return false;
                var lines = File.ReadAllLines(_hostsFilePath);
                return lines.Any(l => l.Contains(_blockMarker));
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Could not read hosts file to check for stale blocks");
                return false;
            }
        }

        /// <summary>
        /// Called on startup to clean up stale FlowShield entries left by a crash.
        /// Returns true if recovery was performed.
        /// </summary>
        public bool RecoverStaleBlocks()
        {
            try
            {
                if (!HasStaleBlocks()) return false;

                Log.Warning("Stale FlowShield hosts file entries detected — attempting crash recovery");
                return DisableBlocking();
            }
            catch (UnauthorizedAccessException)
            {
                Log.Warning("Stale blocks detected but cannot recover without admin privileges");
                return false;
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to recover stale hosts file blocks");
                return false;
            }
        }

        public bool EnableBlocking()
        {
            if (IsRunningAsPackaged())
            {
                Log.Warning("Website blocking is not available in the Store edition. Download from flowshield.app for full features.");
                return false;
            }
            if (!IsRunningAsAdministrator())
            {
                throw new UnauthorizedAccessException("Administrator privileges required to modify hosts file");
            }

            // Defaults if not configured
            if (_blockedDomains.Count == 0)
            {
                SetBlockedDistractions(new List<string> { "Social Media", "Video Streaming", "News Sites", "Messaging" });
            }

            // Always check the actual state from the hosts file
            var actuallyBlocking = IsBlocking();
            if (actuallyBlocking)
            {
                return true; // Already blocking
            }

            try
            {
                // Backup before modifying
                BackupHostsFile();

                // Read current hosts file
                var lines = File.ReadAllLines(_hostsFilePath).ToList();

                // Remove any existing FlowShield blocks
                lines = lines.Where(line => !line.Contains(_blockMarker)).ToList();

                // Add new blocks
                lines.Add("");
                lines.Add("# FlowShield - Website Blocking (Added " + DateTime.Now.ToString("yyyy-MM-dd HH:mm") + ")");

                foreach (var domain in _blockedDomains.Distinct())
                {
                    lines.Add($"127.0.0.1 {domain} {_blockMarker}");
                }

                // Write back to hosts file
                File.WriteAllLines(_hostsFilePath, lines);

                // Flush DNS cache
                FlushDnsCache();

                _isBlocking = true;
                return true;
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to enable website blocking");
                return false;
            }
        }

        public bool DisableBlocking()
        {
            if (IsRunningAsPackaged())
            {
                Log.Warning("Website blocking is not available in the Store edition.");
                return true; // Nothing to disable — we never blocked anything
            }
            if (!IsRunningAsAdministrator())
            {
                throw new UnauthorizedAccessException("Administrator privileges required to modify hosts file");
            }

            // Always check the actual state from the hosts file
            var actuallyBlocking = IsBlocking();

            if (!actuallyBlocking)
            {
                return true; // Already not blocking
            }

            try
            {
                // Read current hosts file
                var lines = File.ReadAllLines(_hostsFilePath).ToList();

                // Remove all FlowShield-related lines (blocks and comments)
                var cleanedLines = new List<string>();
                for (int i = 0; i < lines.Count; i++)
                {
                    var line = lines[i];

                    // Skip lines with FlowShield marker
                    if (line.Contains(_blockMarker))
                    {
                        continue;
                    }

                    // Skip FlowShield comment header
                    if (line.StartsWith("# FlowShield - Website Blocking"))
                    {
                        continue;
                    }

                    // Skip empty lines that come right before FlowShield section
                    if (string.IsNullOrWhiteSpace(line) &&
                        i + 1 < lines.Count &&
                        lines[i + 1].StartsWith("# FlowShield - Website Blocking"))
                    {
                        continue;
                    }

                    cleanedLines.Add(line);
                }

                lines = cleanedLines;

                // Write back to hosts file
                File.WriteAllLines(_hostsFilePath, lines);

                // Flush DNS cache
                FlushDnsCache();

                _isBlocking = false;
                return true;
            }
            catch
            {
                throw; // Re-throw so the UI can show the actual error
            }
        }

        public bool IsBlocking()
        {
            // Check the actual hosts file to determine if blocking is active
            try
            {
                if (!File.Exists(_hostsFilePath))
                {
                    _isBlocking = false;
                    return false;
                }

                var lines = File.ReadAllLines(_hostsFilePath);
                var hasFlowShieldBlocks = lines.Any(line => line.Contains(_blockMarker));
                _isBlocking = hasFlowShieldBlocks;
                return hasFlowShieldBlocks;
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Could not read hosts file to determine blocking state");
                return _isBlocking; // Fallback to in-memory state if file can't be read
            }
        }

        public List<string> GetBlockedDomains()
        {
            return _blockedDomains.Distinct().ToList();
        }

        private void FlushDnsCache()
        {
            try
            {
                var process = new System.Diagnostics.Process
                {
                    StartInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "ipconfig",
                        Arguments = "/flushdns",
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardOutput = true
                    }
                };
                process.Start();
                process.WaitForExit();
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to flush DNS cache");
            }
        }

        public Dictionary<string, string[]> GetAvailableDistractionTypes()
        {
            return _distractionDomains;
        }
    }
}
