using System.Collections.Generic;

namespace FlowShield.Desktop.Interfaces;

public interface IApplicationBlocker
{
    bool IsBlocking { get; }
    void SetBlockedApps(List<string> appNames);
    void BlockApps();
    void UnblockApps();
}
