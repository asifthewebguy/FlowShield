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

        public ApiClient(DatabaseService dbService, string baseUrl = "http://localhost:3000")
        {
            _dbService = dbService;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(baseUrl)
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
            catch (Exception ex)
            {
                Console.WriteLine($"Login error: {ex.Message}");
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
            catch (Exception ex)
            {
                Console.WriteLine($"Sync error: {ex.Message}");
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
            catch (Exception ex)
            {
                Console.WriteLine($"Get active session error: {ex.Message}");
                return null;
            }
        }

        public bool IsAuthenticated()
        {
            return !string.IsNullOrEmpty(_authToken);
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
}
