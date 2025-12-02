using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using FlowShield.Desktop.Models;

namespace FlowShield.Desktop.Services
{
    public class ApiClient
    {
        private readonly HttpClient _httpClient;
        private readonly DatabaseService _dbService;
        private string? _authToken;

        public ApiClient(DatabaseService dbService, string? baseUrl = null)
        {
            _dbService = dbService;

            // Get API URL from settings, fallback to parameter or default
            var apiUrl = _dbService.GetSetting("ApiBaseUrl") ?? baseUrl ?? "https://flowshield.app";

            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(apiUrl)
            };

            // Load saved auth token
            _authToken = _dbService.GetSetting("AuthToken");
            if (!string.IsNullOrEmpty(_authToken))
            {
                _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_authToken}");
            }
        }

        public async Task<bool> LoginAsync(string email, string password)
        {
            try
            {
                var loginData = new { email, password };
                var json = JsonConvert.SerializeObject(loginData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync("/api/auth/login", content);
                if (response.IsSuccessStatusCode)
                {
                    var responseData = await response.Content.ReadAsStringAsync();
                    var result = JsonConvert.DeserializeObject<LoginResponse>(responseData);

                    if (result?.Token != null)
                    {
                        _authToken = result.Token;
                        _httpClient.DefaultRequestHeaders.Remove("Authorization");
                        _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_authToken}");

                        // Save credentials
                        _dbService.SaveSetting("AuthToken", _authToken);
                        _dbService.SaveSetting("UserId", result.UserId ?? string.Empty);

                        return true;
                    }
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> SyncActivitiesAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken))
                    return false;

                var unsyncedLogs = _dbService.GetUnsyncedLogs();
                if (unsyncedLogs.Count == 0)
                    return true;

                // Prepare data for sync
                var syncData = new
                {
                    activities = unsyncedLogs.ConvertAll(log => new
                    {
                        timestamp = log.Timestamp.ToString("o"),
                        windowTitle = log.WindowTitle,
                        processName = log.ProcessName,
                        applicationName = log.ApplicationName,
                        url = log.Url,
                        durationSeconds = log.DurationSeconds,
                        activityLevel = log.ActivityLevel,
                        category = log.Category.ToString()
                    })
                };

                var json = JsonConvert.SerializeObject(syncData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync("/api/activity/sync", content);
                if (response.IsSuccessStatusCode)
                {
                    // Mark logs as synced
                    var logIds = unsyncedLogs.ConvertAll(log => log.Id);
                    _dbService.MarkAsSynced(logIds);

                    _dbService.SaveSetting("LastSyncTime", DateTime.Now.ToString("o"));
                    return true;
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        public async Task<SessionInfo?> GetActiveSessionAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken))
                    return null;

                var response = await _httpClient.GetAsync("/api/sessions/active");
                if (response.IsSuccessStatusCode)
                {
                    var responseData = await response.Content.ReadAsStringAsync();
                    return JsonConvert.DeserializeObject<SessionInfo>(responseData);
                }

                return null;
            }
            catch
            {
                return null;
            }
        }

        public async Task<UserPreferences?> GetUserPreferencesAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken))
                    return null;

                var response = await _httpClient.GetAsync("/api/user/preferences");
                if (response.IsSuccessStatusCode)
                {
                    var responseData = await response.Content.ReadAsStringAsync();
                    var result = JsonConvert.DeserializeObject<PreferencesResponse>(responseData);
                    return result?.Preferences;
                }

                return null;
            }
            catch
            {
                return null;
            }
        }

        public bool IsAuthenticated()
        {
            return !string.IsNullOrEmpty(_authToken);
        }

        public async Task<bool> RegisterDeviceAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken))
                    return false;

                var deviceId = GetDeviceId();
                var deviceName = Environment.MachineName;
                var appVersion = GetAppVersion();

                var deviceData = new
                {
                    deviceId,
                    deviceName,
                    platform = "Windows",
                    appVersion
                };

                var json = JsonConvert.SerializeObject(deviceData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync("/api/devices", content);
                if (response.IsSuccessStatusCode)
                {
                    _dbService.SaveSetting("DeviceId", deviceId);
                    _dbService.SaveSetting("DeviceName", deviceName);
                    return true;
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        private string GetDeviceId()
        {
            // Try to get saved device ID first
            var savedId = _dbService.GetSetting("DeviceId");
            if (!string.IsNullOrEmpty(savedId))
                return savedId;

            // Generate new device ID from machine name and username
            var machineName = Environment.MachineName;
            var userName = Environment.UserName;
            var uniqueString = $"{machineName}-{userName}";

            // Create a consistent hash
            using (var sha256 = System.Security.Cryptography.SHA256.Create())
            {
                var bytes = Encoding.UTF8.GetBytes(uniqueString);
                var hash = sha256.ComputeHash(bytes);
                return Convert.ToBase64String(hash).Replace("+", "-").Replace("/", "_").Substring(0, 32);
            }
        }

        private string GetAppVersion()
        {
            try
            {
                var assembly = System.Reflection.Assembly.GetExecutingAssembly();
                var version = assembly.GetName().Version;
                return version?.ToString() ?? "1.0.0";
            }
            catch
            {
                return "1.0.0";
            }
        }

        public void Logout()
        {
            _authToken = null;
            _httpClient.DefaultRequestHeaders.Remove("Authorization");
            _dbService.SaveSetting("AuthToken", string.Empty);
            _dbService.SaveSetting("UserId", string.Empty);
        }
    }

    public class LoginResponse
    {
        [JsonProperty("token")]
        public string? Token { get; set; }

        [JsonProperty("userId")]
        public string? UserId { get; set; }

        [JsonProperty("user")]
        public UserInfo? User { get; set; }
    }

    public class UserInfo
    {
        [JsonProperty("id")]
        public string? Id { get; set; }

        [JsonProperty("email")]
        public string? Email { get; set; }

        [JsonProperty("name")]
        public string? Name { get; set; }
    }

    public class SessionInfo
    {
        [JsonProperty("id")]
        public string? Id { get; set; }

        [JsonProperty("sessionType")]
        public string? SessionType { get; set; }

        [JsonProperty("plannedDuration")]
        public int PlannedDuration { get; set; }

        [JsonProperty("startTime")]
        public DateTime StartTime { get; set; }
    }

    public class PreferencesResponse
    {
        [JsonProperty("preferences")]
        public UserPreferences? Preferences { get; set; }
    }

    public class UserPreferences
    {
        [JsonProperty("id")]
        public string? Id { get; set; }

        [JsonProperty("userId")]
        public string? UserId { get; set; }

        [JsonProperty("workStyle")]
        public string? WorkStyle { get; set; }

        [JsonProperty("preferredDuration")]
        public int PreferredDuration { get; set; }

        [JsonProperty("primaryDistractions")]
        public List<string>? PrimaryDistractions { get; set; }

        [JsonProperty("workEnvironment")]
        public string? WorkEnvironment { get; set; }

        [JsonProperty("breakReminders")]
        public bool BreakReminders { get; set; }

        [JsonProperty("soundEnabled")]
        public bool SoundEnabled { get; set; }

        [JsonProperty("darkMode")]
        public bool DarkMode { get; set; }
    }
}
