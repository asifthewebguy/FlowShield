using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading; // For DispatcherTimer if we want UI thread friendliness, but System.Timers.Timer is better for services
using FlowShield.Desktop.Interfaces;
using FlowShield.Desktop.Models;

namespace FlowShield.Desktop.Services
{
    public class SessionManager : ISessionManager
    {
        private readonly IApiClient _apiClient;
        private readonly IActivityTracker _activityTracker;
        private readonly INotificationService _notificationService;
        private readonly IWebsiteBlocker _websiteBlocker;
        private readonly IApplicationBlocker _appBlocker;
        private System.Windows.Threading.DispatcherTimer _timer;

        public event EventHandler<TimeSpan>? TimerTick;
        public event EventHandler<SessionInfo>? SessionStarted;
        public event EventHandler? SessionEnded;
        public event EventHandler<bool>? SessionStateChanged; // true = running, false = stopped
        public event EventHandler? SessionPaused;
        public event EventHandler? SessionResumed;

        public bool IsRunning { get; private set; }
        public bool IsPaused { get; private set; }
        public TimeSpan TimeRemaining { get; private set; }
        public SessionInfo? CurrentSession { get; private set; }
        private DateTime _plannedEndUtc;
        private System.Threading.Timer? _reSyncTimer;
        private bool _blockingEnabled = false;
        public bool BlockingEnabled
        {
            get => _blockingEnabled;
            set
            {
                if (_blockingEnabled != value)
                {
                    _blockingEnabled = value;
                    if (IsRunning)
                    {
                        if (_blockingEnabled)
                            EngageBlocking();
                        else
                            DisengageBlocking();
                    }
                }
            }
        }

        public SessionManager(IApiClient apiClient, IActivityTracker activityTracker, INotificationService notificationService, IWebsiteBlocker websiteBlocker, IApplicationBlocker appBlocker)
        {
            _apiClient = apiClient;
            _activityTracker = activityTracker;
            _notificationService = notificationService;
            _websiteBlocker = websiteBlocker;
            _appBlocker = appBlocker;

            _timer = new System.Windows.Threading.DispatcherTimer();
            _timer.Interval = TimeSpan.FromSeconds(1);
            _timer.Tick += OnTimerTick;
        }

        public async Task InitializeAsync()
        {
            // Always start background polling so sessions started on other devices are detected.
            // Dispose any existing timer first to prevent duplicates on re-login.
            _reSyncTimer?.Dispose();
            _reSyncTimer = new System.Threading.Timer(_ => _ = ReSyncFromServerAsync(), null,
                TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));

            // Sync with server state on startup
            try
            {
                var session = await _apiClient.GetActiveSessionAsync();

                if (session != null)
                {
                    CurrentSession = session;
                    _plannedEndUtc = session.StartTime.ToUniversalTime().AddMinutes(session.PlannedDuration);

                    if (session.IsPaused)
                    {
                        // Restore paused state — don't start the timer
                        IsPaused = true;
                        IsRunning = true;
                        TimeRemaining = _plannedEndUtc - DateTime.UtcNow;
                        if (TimeRemaining < TimeSpan.Zero) TimeRemaining = TimeSpan.Zero;
                        SessionStateChanged?.Invoke(this, true);
                    }
                    else
                    {
                        StartLocalTimer(_plannedEndUtc - DateTime.UtcNow);
                        _activityTracker.CurrentSessionId = session.Id;
                        _activityTracker.Start();
                    }

                    // Note: We don't auto-enable blocking on resume safely unless we know it was enabled.
                    // ideally we'd store local state for that. For now, leave it manual or off on resume.

                    SessionStarted?.Invoke(this, session);
                }
            }
            catch { }
        }

        private void OnTimerTick(object? sender, EventArgs e)
        {
            // Recalculate from server-anchored planned end time instead of decrementing locally.
            // This keeps the desktop display in sync with web/extension regardless of timer jitter.
            TimeRemaining = _plannedEndUtc - DateTime.UtcNow;
            if (TimeRemaining < TimeSpan.Zero) TimeRemaining = TimeSpan.Zero;

            TimerTick?.Invoke(this, TimeRemaining);

            if (TimeRemaining.TotalSeconds <= 0)
            {
                _ = StopSessionAsync(completed: true);
            }
        }

        public async Task<bool> StartSessionAsync(int durationMinutes, string sessionType = "WORK", string? projectId = null)
        {
            try
            {
                var session = await _apiClient.StartSessionAsync(durationMinutes, sessionType, projectId);
                if (session != null)
                {
                    CurrentSession = session;

                    // Start local tracking
                    _activityTracker.CurrentSessionId = session.Id;
                    _activityTracker.Start();

                    // Anchor timer to server startTime so desktop stays in sync with web/extension
                    _plannedEndUtc = session.StartTime.ToUniversalTime().AddMinutes(durationMinutes);
                    StartLocalTimer(_plannedEndUtc - DateTime.UtcNow);

                    // Engage Blocking if enabled
                    if (BlockingEnabled)
                    {
                        EngageBlocking();
                    }

                    var typeLabel = sessionType switch { "STUDY" => "Study", "CREATIVE" => "Creative", _ => "Work" };
                    _notificationService.ShowSuccess("Focus Session Started", $"Started a {durationMinutes}-minute {typeLabel} session.");
                    SessionStarted?.Invoke(this, session);
                    return true;
                }
                return false;
            }
            catch (Exception ex)
            {
                _notificationService.ShowError("Failed to start session", ex.Message);
                return false;
            }
        }

        private void EngageBlocking()
        {
            try
            {
                _websiteBlocker.EnableBlocking();
                _appBlocker.BlockApps();
            }
            catch (UnauthorizedAccessException)
            {
                _notificationService.ShowError("Deep Work Failed", "Administrator privileges required to block websites/apps.");
                // Turn off the toggle to reflect reality
                BlockingEnabled = false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SessionManager] Blocking failed: {ex.Message}");
                _notificationService.ShowError("Blocking Error", $"Failed to engage blocking: {ex.Message}");
                BlockingEnabled = false;
            }
        }

        private void DisengageBlocking()
        {
            try
            {
                _websiteBlocker.DisableBlocking();
                _appBlocker.UnblockApps();
            }
            catch { }
        }

        private void StartLocalTimer(TimeSpan duration)
        {
            TimeRemaining = duration;
            IsRunning = true;
            _timer.Start();
            SessionStateChanged?.Invoke(this, true);
        }

        private async Task ReSyncFromServerAsync() => await TriggerResyncAsync();

        /// <summary>
        /// Full cross-device state sync — called by the 30 s poll and by Pusher real-time events.
        /// Handles all four cases: remote start, remote stop, remote pause, remote resume.
        /// </summary>
        public async Task TriggerResyncAsync()
        {
            // A missing/revoked token makes GetActiveSessionAsync return null, which
            // the logic below would misread as "session stopped on another device"
            // and kill the local session + disengage blocking. Never resync while
            // unauthenticated — the local session must survive token revocation.
            if (!_apiClient.IsAuthenticated()) return;

            try
            {
                var session = await _apiClient.GetActiveSessionAsync();

                if (session != null && CurrentSession == null)
                {
                    // Session started on another device — pick it up
                    CurrentSession = session;
                    _plannedEndUtc = session.StartTime.ToUniversalTime().AddMinutes(session.PlannedDuration);
                    _activityTracker.CurrentSessionId = session.Id;
                    _activityTracker.Start();
                    _timer.Dispatcher.Invoke(() => StartLocalTimer(_plannedEndUtc - DateTime.UtcNow));
                    SessionStarted?.Invoke(this, session);
                }
                else if (session == null && CurrentSession != null && IsRunning)
                {
                    // Session stopped on another device — stop locally
                    _timer.Dispatcher.Invoke(() =>
                    {
                        IsRunning = false;
                        IsPaused = false;
                        _timer.Stop();
                    });
                    _activityTracker.Stop();
                    _activityTracker.CurrentSessionId = null;
                    CurrentSession = null;
                    DisengageBlocking();
                    SessionEnded?.Invoke(this, EventArgs.Empty);
                    SessionStateChanged?.Invoke(this, false);
                }
                else if (session != null && CurrentSession != null)
                {
                    if (session.IsPaused && !IsPaused)
                    {
                        // Paused on another device
                        _timer.Dispatcher.Invoke(() => _timer.Stop());
                        IsPaused = true;
                        _activityTracker.Stop();
                        if (BlockingEnabled) DisengageBlocking();
                        SessionPaused?.Invoke(this, EventArgs.Empty);
                    }
                    else if (!session.IsPaused && IsPaused)
                    {
                        // Resumed on another device — server shifted startTime forward
                        CurrentSession = session;
                        _plannedEndUtc = session.StartTime.ToUniversalTime().AddMinutes(session.PlannedDuration);
                        IsPaused = false;
                        _activityTracker.CurrentSessionId = session.Id;
                        _activityTracker.Start();
                        if (BlockingEnabled) EngageBlocking();
                        _timer.Dispatcher.Invoke(() => _timer.Start());
                        SessionResumed?.Invoke(this, EventArgs.Empty);
                    }
                }
            }
            catch { }
        }

        public async Task<bool> PauseSessionAsync()
        {
            if (!IsRunning || IsPaused || CurrentSession?.Id == null)
                return false;

            try
            {
                await _apiClient.TogglePauseAsync(CurrentSession.Id, "pause");

                _timer.Stop();
                IsPaused = true;
                _activityTracker.Stop();

                if (BlockingEnabled)
                    DisengageBlocking();

                _notificationService.ShowInfo("Session Paused", "Focus session paused. Take a break!");
                SessionPaused?.Invoke(this, EventArgs.Empty);
                return true;
            }
            catch (Exception ex)
            {
                _notificationService.ShowError("Failed to pause session", ex.Message);
                return false;
            }
        }

        public async Task<bool> ResumeSessionAsync()
        {
            if (!IsRunning || !IsPaused || CurrentSession?.Id == null)
                return false;

            try
            {
                // Server shifts startTime forward by the paused duration — recalculate from returned session
                var updated = await _apiClient.TogglePauseAsync(CurrentSession.Id, "resume");

                if (updated != null)
                {
                    CurrentSession = updated;
                    _plannedEndUtc = updated.StartTime.ToUniversalTime().AddMinutes(updated.PlannedDuration);
                }

                IsPaused = false;
                _activityTracker.CurrentSessionId = CurrentSession.Id;
                _activityTracker.Start();

                if (BlockingEnabled)
                    EngageBlocking();

                _timer.Start();
                _notificationService.ShowSuccess("Session Resumed", "Back to focus mode!");
                SessionResumed?.Invoke(this, EventArgs.Empty);
                return true;
            }
            catch (Exception ex)
            {
                _notificationService.ShowError("Failed to resume session", ex.Message);
                return false;
            }
        }

        public async Task StopSessionAsync(bool completed = false)
        {
            IsRunning = false;
            IsPaused = false;
            _timer.Stop();
            // Keep _reSyncTimer running — it detects sessions started on other devices

            // Sync stop with server
            if (CurrentSession != null && !string.IsNullOrEmpty(CurrentSession.Id))
            {
                await _apiClient.EndSessionAsync(CurrentSession.Id);
            }

            _activityTracker.Stop();
            _activityTracker.CurrentSessionId = null;
            CurrentSession = null;

            // Disengage Blocking
            DisengageBlocking();

            if (completed)
            {
                _notificationService.ShowInfo("Session Completed", "Great job! Time for a break.");
            }

            SessionEnded?.Invoke(this, EventArgs.Empty);
            SessionStateChanged?.Invoke(this, false);
        }
    }
}
