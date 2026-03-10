using System;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.Interfaces;

public interface IActivityTracker
{
    bool IsTracking { get; }
    string? CurrentSessionId { get; set; }
    void Start();
    void Stop();
    int GetIdleTimeSeconds();
    InputActivityStats GetInputStats();

    event EventHandler? TrackingStarted;
    event EventHandler? TrackingStopped;
    event EventHandler<ActivityLoggedEventArgs>? ActivityLogged;
    event EventHandler<IdleStateChangedEventArgs>? IdleStateChanged;
}
