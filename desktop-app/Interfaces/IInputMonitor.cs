using System;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.Interfaces;

public interface IInputMonitor : IDisposable
{
    int IdleThresholdSeconds { get; set; }
    void Start();
    void Stop();
    bool IsIdle();
    int GetIdleTimeSeconds();
    InputActivityStats GetActivityStats();

    event EventHandler<InputActivityEventArgs>? ActivityDetected;
}
