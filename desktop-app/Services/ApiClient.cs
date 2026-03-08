using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
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
        public event EventHandler? SessionExpired;
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

        public async Task<bool> LoginAsync(string email, string password, bool rememberMe)
        {
            try
            {
                var loginData = new { email, password, rememberMe };
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
                        
                        // Save email for pre-filling next time
                        _dbService.SaveSetting("UserEmail", email);

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
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

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
                    category = log.Category.ToString(),
                    sessionId = log.SessionId
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
            else if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                Logout();
                throw new UnauthorizedAccessException("Sync failed: Session expired.");
            }

            var errorContent = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Sync failed {response.StatusCode}: {errorContent}");
        }

        public async Task<SessionInfo?> GetActiveSessionAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken))
                    return null;

                // Fallback used: Fetch latest session and check if it's active
                // This works even if /api/sessions/active endpoint is missing on server
                var response = await _httpClient.GetAsync("/api/sessions?limit=1");

                if (response.IsSuccessStatusCode)
                {
                    var responseData = await response.Content.ReadAsStringAsync();
                    var list = JsonConvert.DeserializeObject<SessionListResponse>(responseData);

                    if (list != null && list.Sessions.Count > 0)
                    {
                        var latest = list.Sessions[0];

                        // Calculate expected end time if actual EndTime is null (common for running sessions)
                        var endTime = latest.EndTime ?? latest.StartTime.AddMinutes(latest.PlannedDuration);

                        // Update the object so the UI has a valid EndTime to count down to
                        latest.EndTime = endTime;

                        // Check if it is actually active
                        // 1. Not completed
                        // 2. EndTime (calculated) is in the future
                        if (!latest.Completed && endTime > DateTime.UtcNow)
                        {
                            return latest;
                        }
                    }
                }

                return null;
            }
            catch
            {
                return null;
            }
        }

        public async Task<SessionInfo?> StartSessionAsync(int durationMinutes, string sessionType = "WORK")
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            if (!NetworkInterface.GetIsNetworkAvailable())
            {
                var payload = JsonConvert.SerializeObject(new { PlannedDuration = durationMinutes, SessionType = sessionType });
                _dbService.QueuePendingOperation("START_SESSION", payload);
                return null; // Queued for later
            }

            var sessionData = new
            {
                plannedDuration = durationMinutes,
                sessionType
            };

            var json = JsonConvert.SerializeObject(sessionData);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync("/api/sessions", content);

            if (response.IsSuccessStatusCode)
            {
                var responseData = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<SessionResponse>(responseData);
                return result?.Session;
            }
            else if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                Logout();
                throw new UnauthorizedAccessException("Session expired. Please login again.");
            }

            var errorContent = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Server returned {response.StatusCode}: {errorContent}");
        }

        public async Task<bool> EndSessionAsync(string sessionId)
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken))
                    return false;

                if (!NetworkInterface.GetIsNetworkAvailable())
                {
                    var payload = JsonConvert.SerializeObject(new { SessionId = sessionId });
                    _dbService.QueuePendingOperation("END_SESSION", payload);
                    return true; // Queued — treat as success so UI can continue
                }

                var updateData = new
                {
                    completed = true,
                    endTime = DateTime.UtcNow
                };

                var json = JsonConvert.SerializeObject(updateData);
                var content = new StringContent(json, Encoding.UTF8, "application/json"); // PATCH request body

                // HttpClient doesn't have PatchAsync in older versions, but .NET 8 has it.
                // Or use SendAsync with HttpMethod.Patch
                var request = new HttpRequestMessage(new HttpMethod("PATCH"), $"/api/sessions/{sessionId}")
                {
                    Content = content
                };

                var response = await _httpClient.SendAsync(request);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>Replay a queued START_SESSION directly (no offline re-queuing).</summary>
        internal async Task ReplayStartSessionAsync(int durationMinutes, string sessionType)
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            var json = JsonConvert.SerializeObject(new { plannedDuration = durationMinutes, sessionType });
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("/api/sessions", content);
            response.EnsureSuccessStatusCode();
        }

        /// <summary>Replay a queued END_SESSION directly (no offline re-queuing).</summary>
        internal async Task ReplayEndSessionAsync(string sessionId)
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            var json = JsonConvert.SerializeObject(new { completed = true, endTime = DateTime.UtcNow });
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var request = new HttpRequestMessage(new HttpMethod("PATCH"), $"/api/sessions/{sessionId}")
            {
                Content = content
            };
            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
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

            SessionExpired?.Invoke(this, EventArgs.Empty);
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

        [JsonProperty("endTime")]
        public DateTime? EndTime { get; set; }

        [JsonProperty("completed")]
        public bool Completed { get; set; }
    }

    public class SessionListResponse
    {
        [JsonProperty("sessions")]
        public List<SessionInfo> Sessions { get; set; } = new List<SessionInfo>();
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

    public class SessionResponse
    {
        [JsonProperty("session")]
        public SessionInfo? Session { get; set; }
    }
}
