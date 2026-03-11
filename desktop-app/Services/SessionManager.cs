using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading; // For DispatcherTimer if we want UI thread friendliness, but System.Timers.Timer is better for services
using FlowShield.Desktop.Models;
using FlowShield.Desktop.Interfaces;

namespace FlowShield.Desktop.Services
{
    public class SessionManager : ISessionManager
    {
        private readonly ApiClient _apiClient;
        private readonly ActivityTracker _activityTracker;
        private readonly NotificationService _notificationService;
        private readonly WebsiteBlocker _websiteBlocker;
        private readonly ApplicationBlocker _appBlocker;
        private System.Windows.Threading.DispatcherTimer _timer;

        public event EventHandler<TimeSpan>? TimerTick;
        public event EventHandler<SessionInfo>? SessionStarted;
        public event EventHandler? SessionEnded;
        public event EventHandler<bool>? SessionStateChanged; // true = running, false = stopped

        public bool IsRunning { get; private set; }
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

        public SessionManager(ApiClient apiClient, ActivityTracker activityTracker, NotificationService notificationService, WebsiteBlocker websiteBlocker, ApplicationBlocker appBlocker)
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
            // Sync with server state on startup
            try
            {
                var session = await _apiClient.GetActiveSessionAsync();

                if (session != null && session.StartTime.AddMinutes(session.PlannedDuration) > DateTime.UtcNow)
                {
                    // Resume session — anchor to server startTime for accuracy
                    CurrentSession = session;
                    _plannedEndUtc = session.StartTime.ToUniversalTime().AddMinutes(session.PlannedDuration);
                    StartLocalTimer(_plannedEndUtc - DateTime.UtcNow);

                    _activityTracker.CurrentSessionId = session.Id;
                    _activityTracker.Start();

                    // Note: We don't auto-enable blocking on resume safely unless we know it was enabled
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

        public async Task<bool> StartSessionAsync(int durationMinutes)
        {
            try
            {
                var session = await _apiClient.StartSessionAsync(durationMinutes);
                if (session != null)
                {
                    CurrentSession = session;

                    // Start local tracking
                    _activityTracker.CurrentSessionId = session.Id;
                    _activityTracker.Start();

                    // Anchor timer to server startTime so desktop stays in sync with web/extension
                    _plannedEndUtc = session.StartTime.ToUniversalTime().AddMinutes(durationMinutes);
                    StartLocalTimer(_plannedEndUtc - DateTime.UtcNow);

                    // Re-anchor every 30s to catch cross-device session changes
                    _reSyncTimer = new System.Threading.Timer(_ => _ = ReSyncFromServerAsync(), null,
                        TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));

                    // Engage Blocking if enabled
                    if (BlockingEnabled)
                    {
                        EngageBlocking();
                    }

                    _notificationService.ShowSuccess("Focus Session Started", $"Started a {durationMinutes}-minute focus session.");
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

        private async Task ReSyncFromServerAsync()
        {
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
            }
            catch { }
        }

        public async Task StopSessionAsync(bool completed = false)
        {
            IsRunning = false;
            _timer.Stop();
            _reSyncTimer?.Dispose();
            _reSyncTimer = null;

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
