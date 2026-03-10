using System.Collections.Generic;

namespace FlowShield.Desktop.Interfaces;

public interface IWebsiteBlocker
{
    bool IsRunningAsAdministrator();
    void SetBlockedDistractions(List<string> distractionTypes);
    bool EnableBlocking();
    bool DisableBlocking();
    bool IsBlocking();
    List<string> GetBlockedDomains();
    Dictionary<string, string[]> GetAvailableDistractionTypes();
}
