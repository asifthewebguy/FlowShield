using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.Interfaces;

public interface IApiClient
{
    Task<bool> LoginAsync(string email, string password, bool rememberMe);
    Task<bool> SyncActivitiesAsync();
    Task<SessionInfo?> GetActiveSessionAsync();
    Task<SessionInfo?> StartSessionAsync(int durationMinutes, string sessionType = "WORK");
    Task<bool> EndSessionAsync(string sessionId);
    Task<SessionInfo?> TogglePauseAsync(string sessionId, string action);
    Task<UserPreferences?> GetUserPreferencesAsync();
    Task<AnalyticsData?> GetAnalyticsAsync(string period = "week");
    Task<List<SessionInfo>?> GetSessionHistoryAsync(int limit = 10);
    Task<List<GoalModel>?> GetGoalsAsync();
    Task<GoalModel?> SetGoalAsync(string type, int targetValue);
    Task<List<ProjectModel>?> GetProjectsAsync();
    Task<ProjectModel?> CreateProjectAsync(string name, string color = "#3b82f6");
    Task<UserPreferences?> UpdatePreferencesAsync(PreferencesUpdate update);
    bool IsAuthenticated();
    Task<bool> RegisterDeviceAsync();
    void Logout();

    event EventHandler? SessionExpired;
}
