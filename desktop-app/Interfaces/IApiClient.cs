using System;
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
    bool IsAuthenticated();
    Task<bool> RegisterDeviceAsync();
    void Logout();

    event EventHandler? SessionExpired;
}
