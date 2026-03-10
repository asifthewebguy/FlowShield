using FlowShield.Desktop.Interfaces;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Principal;

namespace FlowShield.Desktop.Services
{
    public class WebsiteBlocker : IWebsiteBlocker
    {
        private readonly string _hostsFilePath;
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

        public bool EnableBlocking()
        {
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
            catch
            {
                return false;
            }
        }

        public bool DisableBlocking()
        {
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
            catch
            {
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
            catch
            {
            }
        }

        public Dictionary<string, string[]> GetAvailableDistractionTypes()
        {
            return _distractionDomains;
        }
    }
}
