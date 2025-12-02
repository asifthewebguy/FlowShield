using System;
using System.Threading;
using System.Threading.Tasks;

namespace FlowShield.Desktop.Services
{
    public class SyncService
    {
        private readonly ApiClient _apiClient;
        private readonly DatabaseService _dbService;
        private Timer? _syncTimer;
        private bool _isSyncing = false;

        public event EventHandler<SyncEventArgs>? SyncStarted;
        public event EventHandler<SyncEventArgs>? SyncCompleted;
        public event EventHandler<SyncEventArgs>? SyncFailed;

        public SyncService(ApiClient apiClient, DatabaseService dbService)
        {
            _apiClient = apiClient;
            _dbService = dbService;
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
            _syncTimer?.Dispose();
            _syncTimer = null;
        }

        public async Task<bool> SyncNowAsync()
        {
            if (_isSyncing || !_apiClient.IsAuthenticated())
                return false;

            _isSyncing = true;

            // Get initial count
            var initialUnsyncedCount = _dbService.GetUnsyncedLogs().Count;

            // Raise sync started event
            SyncStarted?.Invoke(this, new SyncEventArgs
            {
                Success = false,
                Timestamp = DateTime.Now,
                RemainingUnsyncedCount = initialUnsyncedCount,
                SyncedCount = 0
            });

            try
            {
                var success = await _apiClient.SyncActivitiesAsync();

                // Also update device status during sync
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
                {
                    SyncCompleted?.Invoke(this, eventArgs);
                }
                else
                {
                    SyncFailed?.Invoke(this, eventArgs);
                }

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
                _isSyncing = false;
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
}
