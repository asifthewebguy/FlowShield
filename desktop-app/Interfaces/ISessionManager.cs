using System;
using System.Threading.Tasks;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.Interfaces;

public interface ISessionManager
{
    bool IsRunning { get; }
    bool IsPaused { get; }
    TimeSpan TimeRemaining { get; }
    SessionInfo? CurrentSession { get; }
    bool BlockingEnabled { get; set; }
    Task InitializeAsync();
    Task<bool> StartSessionAsync(int durationMinutes, string sessionType = "WORK");
    Task StopSessionAsync(bool completed = false);
    Task<bool> PauseSessionAsync();
    Task<bool> ResumeSessionAsync();

    event EventHandler<TimeSpan>? TimerTick;
    event EventHandler<SessionInfo>? SessionStarted;
    event EventHandler? SessionEnded;
    event EventHandler<bool>? SessionStateChanged;
    event EventHandler? SessionPaused;
    event EventHandler? SessionResumed;
}
