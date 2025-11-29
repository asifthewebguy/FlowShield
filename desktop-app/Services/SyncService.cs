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

        public event EventHandler<SyncEventArgs>? SyncCompleted;

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
            try
            {
                var success = await _apiClient.SyncActivitiesAsync();

                var unsyncedCount = _dbService.GetUnsyncedLogs().Count;
                SyncCompleted?.Invoke(this, new SyncEventArgs
                {
                    Success = success,
                    Timestamp = DateTime.Now,
                    RemainingUnsyncedCount = unsyncedCount
                });

                return success;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Sync error: {ex.Message}");
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
    }
}
