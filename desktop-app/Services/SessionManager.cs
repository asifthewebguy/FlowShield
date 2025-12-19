using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading; // For DispatcherTimer if we want UI thread friendliness, but System.Timers.Timer is better for services
using FlowShield.Desktop.Models;

namespace FlowShield.Desktop.Services
{
    public class SessionManager
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

                if (session != null && session.EndTime > DateTime.UtcNow)
                {
                    // Resume session
                    CurrentSession = session;
                    var remaining = session.EndTime.Value - DateTime.UtcNow;
                    StartLocalTimer(remaining);

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
            TimeRemaining = TimeRemaining.Subtract(TimeSpan.FromSeconds(1));

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

                    // Start Timer
                    StartLocalTimer(TimeSpan.FromMinutes(durationMinutes));

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

        public async Task StopSessionAsync(bool completed = false)
        {
            IsRunning = false;
            _timer.Stop();

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
