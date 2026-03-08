using System;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace FlowShield.Desktop.Services
{
    public class SyncService
    {
        private readonly ApiClient _apiClient;
        private readonly DatabaseService _dbService;
        private Timer? _syncTimer;
        private readonly SemaphoreSlim _syncLock = new(1, 1);
        private bool _wasOffline = false;

        public event EventHandler<SyncEventArgs>? SyncStarted;
        public event EventHandler<SyncEventArgs>? SyncCompleted;
        public event EventHandler<SyncEventArgs>? SyncFailed;

        public bool IsNetworkAvailable => NetworkInterface.GetIsNetworkAvailable();

        public SyncService(ApiClient apiClient, DatabaseService dbService)
        {
            _apiClient = apiClient;
            _dbService = dbService;

            // Trigger immediate sync when network comes back online
            NetworkChange.NetworkAvailabilityChanged += OnNetworkAvailabilityChanged;
        }

        private void OnNetworkAvailabilityChanged(object? sender, NetworkAvailabilityEventArgs e)
        {
            if (e.IsAvailable && _wasOffline)
            {
                _wasOffline = false;
                _ = Task.Run(async () => await SyncNowAsync());
            }
            else if (!e.IsAvailable)
            {
                _wasOffline = true;
            }
        }

        public void Start(int intervalMinutes = 5)
        {
            _syncTimer = new Timer(
                async _ => await SyncNowAsync(),
                null,
                TimeSpan.Zero,
                TimeSpan.FromMinutes(intervalMinutes)
            );
        }

        public void Stop()
        {
            NetworkChange.NetworkAvailabilityChanged -= OnNetworkAvailabilityChanged;
            _syncTimer?.Dispose();
            _syncTimer = null;
        }

        public async Task<bool> SyncNowAsync()
        {
            if (!_apiClient.IsAuthenticated())
                return false;

            if (!IsNetworkAvailable)
            {
                _wasOffline = true;
                return false;
            }

            // Prevent concurrent syncs — if another sync is running, skip
            if (!await _syncLock.WaitAsync(0))
                return false;

            var initialUnsyncedCount = _dbService.GetUnsyncedLogs().Count;

            SyncStarted?.Invoke(this, new SyncEventArgs
            {
                Success = false,
                Timestamp = DateTime.Now,
                RemainingUnsyncedCount = initialUnsyncedCount,
                SyncedCount = 0
            });

            try
            {
                // Replay any pending session operations first (calls API directly,
                // bypassing the offline-queuing logic in ApiClient to avoid re-queuing)
                await ReplayPendingOperationsAsync();

                var success = await _apiClient.SyncActivitiesAsync();

                await _apiClient.RegisterDeviceAsync();

                var remainingUnsyncedCount = _dbService.GetUnsyncedLogs().Count;
                var syncedCount = initialUnsyncedCount - remainingUnsyncedCount;

                var eventArgs = new SyncEventArgs
                {
                    Success = success,
                    Timestamp = DateTime.Now,
                    RemainingUnsyncedCount = remainingUnsyncedCount,
                    SyncedCount = syncedCount
                };

                if (success)
                    SyncCompleted?.Invoke(this, eventArgs);
                else
                    SyncFailed?.Invoke(this, eventArgs);

                return success;
            }
            catch (Exception ex)
            {
                SyncFailed?.Invoke(this, new SyncEventArgs
                {
                    Success = false,
                    Timestamp = DateTime.Now,
                    RemainingUnsyncedCount = initialUnsyncedCount,
                    SyncedCount = 0,
                    ErrorMessage = ex.Message
                });

                return false;
            }
            finally
            {
                _syncLock.Release();
            }
        }

        /// <summary>
        /// Replays queued session operations directly via the ApiClient's HTTP methods,
        /// bypassing StartSessionAsync/EndSessionAsync to avoid re-queuing on transient failures.
        /// </summary>
        private async Task ReplayPendingOperationsAsync()
        {
            var pending = _dbService.GetPendingOperations();
            foreach (var op in pending)
            {
                try
                {
                    if (op.OperationType == "START_SESSION")
                    {
                        var payload = JsonConvert.DeserializeObject<StartSessionPayload>(op.Payload);
                        if (payload != null)
                            await _apiClient.ReplayStartSessionAsync(payload.PlannedDuration, payload.SessionType);
                    }
                    else if (op.OperationType == "END_SESSION")
                    {
                        var payload = JsonConvert.DeserializeObject<EndSessionPayload>(op.Payload);
                        if (payload != null)
                            await _apiClient.ReplayEndSessionAsync(payload.SessionId);
                    }

                    _dbService.RemovePendingOperation(op.Id);
                }
                catch
                {
                    _dbService.IncrementRetryCount(op.Id);
                }
            }
        }
    }

    public class SyncEventArgs : EventArgs
    {
        public bool Success { get; set; }
        public DateTime Timestamp { get; set; }
        public int RemainingUnsyncedCount { get; set; }
        public int SyncedCount { get; set; }
        public string? ErrorMessage { get; set; }
    }

    internal class StartSessionPayload
    {
        public int PlannedDuration { get; set; }
        public string SessionType { get; set; } = "WORK";
    }

    internal class EndSessionPayload
    {
        public string SessionId { get; set; } = string.Empty;
    }
}
