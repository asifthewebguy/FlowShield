using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using FlowShield.Desktop.Models;
using FlowShield.Desktop.Interfaces;

namespace FlowShield.Desktop.Services
{
    public class ApiClient : IApiClient
    {
        private readonly HttpClient _httpClient;
        private readonly IDatabaseService _dbService;
        public event EventHandler? SessionExpired;
        private string? _authToken;

        /// <summary>
        /// Reason the most recent <see cref="LoginAsync"/> call failed, when
        /// the API returned a structured error. Null on success or transport
        /// failures. Useful values: "EMAIL_NOT_VERIFIED", "INVALID_CREDENTIALS".
        /// </summary>
        public string? LastLoginErrorCode { get; private set; }

        /// <summary>Human-readable message from the most recent failed login.</summary>
        public string? LastLoginErrorMessage { get; private set; }

        public ApiClient(IDatabaseService dbService, string? baseUrl = null)
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

        /// <summary>Test-only constructor with injectable HttpMessageHandler.</summary>
        internal ApiClient(IDatabaseService dbService, HttpMessageHandler handler, string baseUrl = "https://localhost")
        {
            _dbService = dbService;
            _httpClient = new HttpClient(handler) { BaseAddress = new Uri(baseUrl) };
            _authToken = _dbService.GetSetting("AuthToken");
            if (!string.IsNullOrEmpty(_authToken))
            {
                _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_authToken}");
            }
        }

        public async Task<bool> LoginAsync(string email, string password, bool rememberMe)
        {
            LastLoginErrorCode = null;
            LastLoginErrorMessage = null;

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

                // Parse structured error so callers can show specific copy
                // (e.g. "Please verify your email") instead of generic "Login failed".
                try
                {
                    var errorBody = await response.Content.ReadAsStringAsync();
                    var err = JsonConvert.DeserializeObject<LoginErrorResponse>(errorBody);
                    LastLoginErrorCode = err?.Code;
                    LastLoginErrorMessage = err?.Error;
                }
                catch
                {
                    // ignore parse failures — caller falls back to generic error
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        private class LoginErrorResponse
        {
            [JsonProperty("error")] public string? Error { get; set; }
            [JsonProperty("code")] public string? Code { get; set; }
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
                    category = CategoryService.NormalizeCategory(log.Category),
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
                if (HandleUnauthorized(response)) return null;

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

                        // Check if it is actually active:
                        // 1. Not completed, AND
                        // 2. Either still has time remaining OR is currently paused
                        if (!latest.Completed && (endTime > DateTime.UtcNow || latest.IsPaused))
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

        public async Task<SessionInfo?> StartSessionAsync(int durationMinutes, string sessionType = "WORK", string? projectId = null)
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
                sessionType,
                projectId
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
                if (HandleUnauthorized(response)) return false;
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        public async Task<SessionInfo?> TogglePauseAsync(string sessionId, string action)
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            var json = JsonConvert.SerializeObject(new { action });
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"/api/sessions/{sessionId}/toggle-pause", content);

            if (response.IsSuccessStatusCode)
            {
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<SessionResponse>(data);
                return result?.Session;
            }
            else if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                Logout();
                throw new UnauthorizedAccessException("Session expired. Please login again.");
            }

            var errorContent = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Toggle pause failed {response.StatusCode}: {errorContent}");
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
                if (HandleUnauthorized(response)) return null;
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
                if (HandleUnauthorized(response)) return false;
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

        public async Task<AnalyticsData?> GetAnalyticsAsync(string period = "week")
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken)) return null;
                var response = await _httpClient.GetAsync($"/api/analytics?period={period}");
                if (HandleUnauthorized(response)) return null;
                if (!response.IsSuccessStatusCode) return null;
                var data = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<AnalyticsData>(data);
            }
            catch { return null; }
        }

        public async Task<List<SessionInfo>?> GetSessionHistoryAsync(int limit = 10)
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken)) return null;
                var response = await _httpClient.GetAsync($"/api/sessions?limit={limit}");
                if (HandleUnauthorized(response)) return null;
                if (!response.IsSuccessStatusCode) return null;
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<SessionListResponse>(data);
                return result?.Sessions;
            }
            catch { return null; }
        }

        public async Task<List<GoalModel>?> GetGoalsAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken)) return null;
                var response = await _httpClient.GetAsync("/api/goals");
                if (HandleUnauthorized(response)) return null;
                if (!response.IsSuccessStatusCode) return null;
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<GoalListResponse>(data);
                return result?.Goals;
            }
            catch { return null; }
        }

        public async Task<GoalModel?> SetGoalAsync(string type, int targetValue)
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            var json = JsonConvert.SerializeObject(new { type, targetValue });
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("/api/goals", content);

            if (response.IsSuccessStatusCode)
            {
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<GoalResponse>(data);
                return result?.Goal;
            }
            else if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                Logout();
                throw new UnauthorizedAccessException("Session expired. Please login again.");
            }

            var error = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Set goal failed {response.StatusCode}: {error}");
        }

        public async Task<List<ProjectModel>?> GetProjectsAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken)) return null;
                var response = await _httpClient.GetAsync("/api/projects");
                if (HandleUnauthorized(response)) return null;
                if (!response.IsSuccessStatusCode) return null;
                var data = await response.Content.ReadAsStringAsync();
                // Projects API returns a direct array, not a wrapped object
                return JsonConvert.DeserializeObject<List<ProjectModel>>(data);
            }
            catch { return null; }
        }

        public async Task<ProjectModel?> CreateProjectAsync(string name, string color = "#3b82f6")
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            var json = JsonConvert.SerializeObject(new { name, color });
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("/api/projects", content);

            if (response.IsSuccessStatusCode)
            {
                var data = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<ProjectModel>(data);
            }
            else if (response.StatusCode == HttpStatusCode.Conflict)
            {
                throw new InvalidOperationException("A project with this name already exists.");
            }
            else if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                Logout();
                throw new UnauthorizedAccessException("Session expired. Please login again.");
            }

            var error = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Create project failed {response.StatusCode}: {error}");
        }

        public async Task<UserPreferences?> UpdatePreferencesAsync(PreferencesUpdate update)
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken)) return null;

                var json = JsonConvert.SerializeObject(update);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var request = new HttpRequestMessage(new HttpMethod("PATCH"), "/api/user/preferences")
                {
                    Content = content
                };
                var response = await _httpClient.SendAsync(request);
                if (HandleUnauthorized(response)) return null;
                if (!response.IsSuccessStatusCode) return null;
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<PreferencesResponse>(data);
                return result?.Preferences;
            }
            catch { return null; }
        }

        public async Task<LeaderboardData?> GetLeaderboardAsync(string period = "week")
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken)) return null;
                var response = await _httpClient.GetAsync($"/api/leaderboard?period={period}");
                if (HandleUnauthorized(response)) return null;
                if (!response.IsSuccessStatusCode) return null;
                var data = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<LeaderboardData>(data);
            }
            catch { return null; }
        }

        public async Task GetCoachAdviceStreamAsync(string message, string? context, Action<string> onChunk, CancellationToken ct = default)
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            var json = JsonConvert.SerializeObject(new { message, context });
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/coach/advice")
            {
                Content = content
            };

            var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            while (!reader.EndOfStream && !ct.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync();
                if (string.IsNullOrEmpty(line)) continue;

                if (!line.StartsWith("data:")) continue;

                var payload = line.Substring(5).Trim();
                if (payload == "[DONE]") break;

                try
                {
                    var chunk = JsonConvert.DeserializeObject<CoachChunk>(payload);
                    // Handle Anthropic-style: {"type":"content_block_delta","delta":{"text":"..."}}
                    var text = chunk?.Delta?.Text ?? chunk?.Text;
                    if (!string.IsNullOrEmpty(text))
                        onChunk(text);
                }
                catch { /* skip unparseable SSE lines */ }
            }
        }

        public async Task<List<TeamModel>?> GetTeamsAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken)) return null;
                var response = await _httpClient.GetAsync("/api/teams");
                if (HandleUnauthorized(response)) return null;
                if (!response.IsSuccessStatusCode) return null;
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<TeamsResponse>(data);
                return result?.Teams;
            }
            catch { return null; }
        }

        public async Task<TeamModel?> CreateTeamAsync(string name)
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            var json = JsonConvert.SerializeObject(new { name });
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("/api/teams", content);

            if (response.IsSuccessStatusCode)
            {
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<TeamCreateResponse>(data);
                return result?.Team;
            }
            else if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                Logout();
                throw new UnauthorizedAccessException("Session expired. Please login again.");
            }

            var error = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Create team failed {response.StatusCode}: {error}");
        }

        public async Task<TeamModel?> JoinTeamAsync(string inviteCode)
        {
            if (string.IsNullOrEmpty(_authToken))
                throw new InvalidOperationException("Not authenticated");

            var json = JsonConvert.SerializeObject(new { inviteCode });
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("/api/teams/join", content);

            if (response.IsSuccessStatusCode)
            {
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<JoinTeamResponse>(data);
                return result?.Team;
            }
            else if (response.StatusCode == HttpStatusCode.NotFound)
            {
                throw new InvalidOperationException("Invalid invite code.");
            }
            else if (response.StatusCode == HttpStatusCode.Conflict)
            {
                throw new InvalidOperationException("Already a member of this team.");
            }
            else if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                Logout();
                throw new UnauthorizedAccessException("Session expired. Please login again.");
            }

            var error = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Join team failed {response.StatusCode}: {error}");
        }

        public async Task<List<CategoryRuleModel>?> GetCategoryRulesAsync()
        {
            try
            {
                if (string.IsNullOrEmpty(_authToken)) return null;
                var response = await _httpClient.GetAsync("/api/categories");
                if (HandleUnauthorized(response)) return null;
                if (!response.IsSuccessStatusCode) return null;
                var data = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<CategoryRulesResponse>(data);
                return result?.Rules.ConvertAll(r => new CategoryRuleModel
                {
                    Keyword = r.Keyword,
                    MatchField = r.MatchField,
                    Category = r.Category,
                    Priority = r.Priority,
                });
            }
            catch { return null; }
        }

        public void Logout()
        {
            // Idempotent: concurrent 401s from parallel requests must not re-fire
            // SessionExpired or thrash the DB settings.
            if (string.IsNullOrEmpty(_authToken)) return;

            _authToken = null;
            _httpClient.DefaultRequestHeaders.Remove("Authorization");
            _dbService.SaveSetting("AuthToken", string.Empty);
            _dbService.SaveSetting("UserId", string.Empty);

            SessionExpired?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Detects a 401 response, clears auth state, and raises SessionExpired
        /// (once, via the idempotent Logout). Returns true when the response was
        /// a 401 and has been handled.
        /// </summary>
        private bool HandleUnauthorized(HttpResponseMessage response)
        {
            if (response.StatusCode != HttpStatusCode.Unauthorized) return false;
            Logout();
            return true;
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

        [JsonProperty("isPaused")]
        public bool IsPaused { get; set; }

        [JsonProperty("pausedAt")]
        public DateTime? PausedAt { get; set; }
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

    // ---------- Goals models ----------

    public class GoalModel
    {
        [JsonProperty("id")]
        public string Id { get; set; } = "";

        [JsonProperty("goalType")]
        public string GoalType { get; set; } = "";

        [JsonProperty("targetValue")]
        public int TargetValue { get; set; }

        [JsonProperty("currentValue")]
        public int CurrentValue { get; set; }

        [JsonProperty("active")]
        public bool Active { get; set; }

        [JsonProperty("startDate")]
        public DateTime StartDate { get; set; }
    }

    public class GoalListResponse
    {
        [JsonProperty("goals")]
        public List<GoalModel> Goals { get; set; } = new();
    }

    public class GoalResponse
    {
        [JsonProperty("goal")]
        public GoalModel? Goal { get; set; }
    }

    // ---------- Projects models ----------

    public class ProjectModel
    {
        [JsonProperty("id")]
        public string Id { get; set; } = "";

        [JsonProperty("name")]
        public string Name { get; set; } = "";

        [JsonProperty("color")]
        public string Color { get; set; } = "#3b82f6";

        [JsonProperty("_count")]
        public ProjectCount? Count { get; set; }

        public int SessionCount => Count?.Sessions ?? 0;
    }

    public class ProjectCount
    {
        [JsonProperty("sessions")]
        public int Sessions { get; set; }
    }

    // ---------- Preferences update ----------

    public class PreferencesUpdate
    {
        [JsonProperty("workStyle", NullValueHandling = NullValueHandling.Ignore)]
        public string? WorkStyle { get; set; }

        [JsonProperty("preferredDuration", NullValueHandling = NullValueHandling.Ignore)]
        public int? PreferredDuration { get; set; }

        [JsonProperty("primaryDistractions", NullValueHandling = NullValueHandling.Ignore)]
        public List<string>? PrimaryDistractions { get; set; }

        [JsonProperty("breakReminders", NullValueHandling = NullValueHandling.Ignore)]
        public bool? BreakReminders { get; set; }

        [JsonProperty("soundEnabled", NullValueHandling = NullValueHandling.Ignore)]
        public bool? SoundEnabled { get; set; }
    }

    // ---------- Analytics models ----------

    public class AnalyticsData
    {
        [JsonProperty("period")]
        public string Period { get; set; } = "";

        [JsonProperty("dailyStats")]
        public List<DailyStat> DailyStats { get; set; } = new();

        [JsonProperty("summary")]
        public AnalyticsSummary Summary { get; set; } = new();

        [JsonProperty("peakTimes")]
        public PeakTimes? PeakTimes { get; set; }
    }

    public class DailyStat
    {
        [JsonProperty("date")]
        public string Date { get; set; } = "";

        [JsonProperty("sessionsCount")]
        public int SessionsCount { get; set; }

        [JsonProperty("completedCount")]
        public int CompletedCount { get; set; }

        [JsonProperty("totalMinutes")]
        public int TotalMinutes { get; set; }

        [JsonProperty("productivityScore")]
        public int ProductivityScore { get; set; }
    }

    public class AnalyticsSummary
    {
        [JsonProperty("totalSessions")]
        public int TotalSessions { get; set; }

        [JsonProperty("completedSessions")]
        public int CompletedSessions { get; set; }

        [JsonProperty("totalFocusMinutes")]
        public int TotalFocusMinutes { get; set; }

        [JsonProperty("averageProductivityScore")]
        public int AverageProductivityScore { get; set; }

        [JsonProperty("completionRate")]
        public int CompletionRate { get; set; }
    }

    public class PeakTimes
    {
        [JsonProperty("peakHour")]
        public int PeakHour { get; set; }

        [JsonProperty("peakPeriod")]
        public string? PeakPeriod { get; set; }
    }

    public class CategoryRuleApiModel
    {
        [JsonProperty("keyword")]
        public string Keyword { get; set; } = string.Empty;

        [JsonProperty("matchField")]
        public string MatchField { get; set; } = "applicationName";

        [JsonProperty("category")]
        public string Category { get; set; } = "Unknown";

        [JsonProperty("priority")]
        public int Priority { get; set; } = 100;
    }

    public class CategoryRulesResponse
    {
        [JsonProperty("rules")]
        public List<CategoryRuleApiModel> Rules { get; set; } = new();
    }

    // ---------- Leaderboard models ----------

    public class LeaderboardEntry
    {
        [JsonProperty("rank")]
        public int Rank { get; set; }

        [JsonProperty("userId")]
        public string UserId { get; set; } = "";

        [JsonProperty("name")]
        public string UserName { get; set; } = "";

        [JsonProperty("totalMinutes")]
        public int TotalMinutes { get; set; }

        [JsonProperty("sessionsCount")]
        public int SessionsCount { get; set; }

        [JsonProperty("streak")]
        public int Streak { get; set; }

        [JsonProperty("isCurrentUser")]
        public bool IsCurrentUser { get; set; }
    }

    public class LeaderboardData
    {
        [JsonProperty("leaderboard")]
        public List<LeaderboardEntry> Leaderboard { get; set; } = new();

        [JsonProperty("period")]
        public string Period { get; set; } = "";

        [JsonProperty("userRank")]
        public int UserRank { get; set; }
    }

    // ---------- Coach streaming models ----------

    public class CoachChunk
    {
        [JsonProperty("type")]
        public string? Type { get; set; }

        [JsonProperty("text")]
        public string? Text { get; set; }

        [JsonProperty("delta")]
        public CoachDelta? Delta { get; set; }
    }

    public class CoachDelta
    {
        [JsonProperty("type")]
        public string? Type { get; set; }

        [JsonProperty("text")]
        public string? Text { get; set; }
    }

    // ---------- Teams models ----------

    public class TeamModel
    {
        [JsonProperty("id")]
        public string Id { get; set; } = "";

        [JsonProperty("name")]
        public string Name { get; set; } = "";

        [JsonProperty("ownerId")]
        public string OwnerId { get; set; } = "";

        [JsonProperty("inviteCode")]
        public string InviteCode { get; set; } = "";

        [JsonProperty("myRole")]
        public string MyRole { get; set; } = "";

        [JsonProperty("memberCount")]
        public int MemberCount { get; set; }

        [JsonProperty("joinedAt")]
        public DateTime? JoinedAt { get; set; }
    }

    public class TeamsResponse
    {
        [JsonProperty("teams")]
        public List<TeamModel> Teams { get; set; } = new();
    }

    public class TeamCreateResponse
    {
        [JsonProperty("team")]
        public TeamModel? Team { get; set; }
    }

    public class JoinTeamResponse
    {
        [JsonProperty("team")]
        public TeamModel? Team { get; set; }

        [JsonProperty("message")]
        public string? Message { get; set; }
    }
}
