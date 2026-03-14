using System;
using System.Threading.Tasks;
using PusherClient;
using Serilog;

namespace FlowShield.Desktop.Services
{
    /// <summary>
    /// Connects to the Pusher per-user channel so real-time session events
    /// (start/stop/pause/resume from other devices) arrive instantly instead
    /// of waiting for the 30-second polling cycle.
    ///
    /// Channel: user-{userId}  (public — no auth endpoint needed)
    /// Events:  session-update (empty payload — triggers a full server resync)
    /// </summary>
    public class PusherService : IDisposable
    {
        private readonly string _pusherKey;
        private readonly string _pusherCluster;
        private Pusher? _pusher;
        private Channel? _channel;

        /// <summary>Raised on the Pusher event thread when a session-update event arrives.</summary>
        public event EventHandler? SessionUpdateReceived;

        public PusherService(string pusherKey, string pusherCluster)
        {
            _pusherKey = pusherKey;
            _pusherCluster = pusherCluster;
        }

        public async Task ConnectAsync(string userId)
        {
            try
            {
                await DisconnectAsync();

                _pusher = new Pusher(_pusherKey, new PusherOptions
                {
                    Cluster = _pusherCluster,
                    Encrypted = true,
                });

                _pusher.Error += (sender, ex) =>
                    Log.Warning("Pusher error: {Message}", ex.Message);

                _pusher.ConnectionStateChanged += (sender, state) =>
                    Log.Debug("Pusher state: {State}", state);

                await _pusher.ConnectAsync();

                _channel = await _pusher.SubscribeAsync($"user-{userId}");
                _channel.Bind("session-update", (PusherEvent e) =>
                {
                    SessionUpdateReceived?.Invoke(this, EventArgs.Empty);
                });

                Log.Information("[Pusher] Connected to channel user-{UserId}", userId);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "[Pusher] Connection failed — real-time disabled, 30 s poll remains active");
            }
        }

        public async Task DisconnectAsync()
        {
            try
            {
                if (_pusher != null)
                {
                    await _pusher.DisconnectAsync();
                    _pusher = null;
                    _channel = null;
                }
            }
            catch { }
        }

        public void Dispose()
        {
            _ = DisconnectAsync();
        }
    }
}
