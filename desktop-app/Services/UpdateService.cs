using System;
using System.Net.Http;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Newtonsoft.Json;

namespace FlowShield.Desktop.Services
{
    public class UpdateInfo
    {
        public string LatestVersion { get; set; } = string.Empty;
        public string DownloadUrl { get; set; } = string.Empty;
        public string ReleaseNotes { get; set; } = string.Empty;
    }

    public class UpdateService
    {
        private const string ReleasesApiUrl = "https://api.github.com/repos/asifthewebguy/FlowShield/releases/latest";
        private readonly HttpClient _http;
        private readonly SynchronizationContext? _syncContext;

        public UpdateService()
        {
            // Capture the UI SynchronizationContext so we can marshal dialogs to the UI thread
            _syncContext = SynchronizationContext.Current;
            _http = new HttpClient();
            _http.DefaultRequestHeaders.Add("User-Agent", "FlowShield-Desktop");
        }

        public string CurrentVersion
        {
            get
            {
                var version = Assembly.GetExecutingAssembly().GetName().Version;
                return version != null ? $"{version.Major}.{version.Minor}.{version.Build}" : "1.0.0";
            }
        }

        public async Task<UpdateInfo?> CheckForUpdateAsync()
        {
            try
            {
                var response = await _http.GetAsync(ReleasesApiUrl);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync();
                var release = JsonConvert.DeserializeObject<GitHubRelease>(json);
                if (release == null) return null;

                // Strip leading 'v' from tag name (e.g. "v1.7.0" → "1.7.0")
                var latestVersion = release.TagName?.TrimStart('v') ?? string.Empty;

                if (!IsNewerVersion(latestVersion, CurrentVersion))
                    return null;

                // Find the installer asset
                var downloadUrl = string.Empty;
                if (release.Assets != null)
                {
                    foreach (var asset in release.Assets)
                    {
                        if (asset.Name != null && asset.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        {
                            downloadUrl = asset.BrowserDownloadUrl ?? string.Empty;
                            break;
                        }
                    }
                }

                // Fall back to the release HTML page if no asset found
                if (string.IsNullOrEmpty(downloadUrl))
                    downloadUrl = release.HtmlUrl ?? string.Empty;

                return new UpdateInfo
                {
                    LatestVersion = latestVersion,
                    DownloadUrl = downloadUrl,
                    ReleaseNotes = release.Body ?? string.Empty,
                };
            }
            catch
            {
                return null;
            }
        }

        /// <summary>Checks GitHub and shows an update dialog if a new version is available.</summary>
        public async Task CheckAndPromptAsync()
        {
            var update = await CheckForUpdateAsync();
            if (update == null) return;

            // Marshal the dialog to the UI thread so it appears as a proper modal
            if (_syncContext != null)
            {
                _syncContext.Post(_ => ShowUpdateDialog(update), null);
            }
            else
            {
                ShowUpdateDialog(update);
            }
        }

        private void ShowUpdateDialog(UpdateInfo update)
        {
            var message = $"A new version of FlowShield is available!\n\n" +
                          $"Current version: {CurrentVersion}\n" +
                          $"Latest version:  {update.LatestVersion}\n\n" +
                          $"Would you like to download the update now?";

            var result = MessageBox.Show(
                message,
                "Update Available",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Information
            );

            if (result == DialogResult.Yes)
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = update.DownloadUrl,
                    UseShellExecute = true
                });
            }
        }

        // Returns true if `latest` is strictly greater than `current` (semver major.minor.patch)
        private static bool IsNewerVersion(string latest, string current)
        {
            if (string.IsNullOrEmpty(latest)) return false;

            var latestParts = ParseVersion(latest);
            var currentParts = ParseVersion(current);

            for (int i = 0; i < 3; i++)
            {
                if (latestParts[i] > currentParts[i]) return true;
                if (latestParts[i] < currentParts[i]) return false;
            }

            return false; // equal
        }

        private static int[] ParseVersion(string version)
        {
            var parts = new int[3];
            var segments = Regex.Replace(version, "[^0-9.]", "").Split('.');
            for (int i = 0; i < Math.Min(3, segments.Length); i++)
                int.TryParse(segments[i], out parts[i]);
            return parts;
        }

        private class GitHubRelease
        {
            [JsonProperty("tag_name")]
            public string? TagName { get; set; }

            [JsonProperty("html_url")]
            public string? HtmlUrl { get; set; }

            [JsonProperty("body")]
            public string? Body { get; set; }

            [JsonProperty("assets")]
            public GitHubAsset[]? Assets { get; set; }
        }

        private class GitHubAsset
        {
            [JsonProperty("name")]
            public string? Name { get; set; }

            [JsonProperty("browser_download_url")]
            public string? BrowserDownloadUrl { get; set; }
        }
    }
}
