using System;
using System.Threading.Tasks;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.Interfaces;

public interface ISyncService
{
    bool IsNetworkAvailable { get; }
    void Start(int intervalMinutes = 5);
    void Stop();
    Task<bool> SyncNowAsync();

    event EventHandler<SyncEventArgs>? SyncStarted;
    event EventHandler<SyncEventArgs>? SyncCompleted;
    event EventHandler<SyncEventArgs>? SyncFailed;
}
