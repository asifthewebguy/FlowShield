using System.Collections.Generic;

namespace FlowShield.Desktop.Interfaces;

public interface IWebsiteBlocker
{
    bool IsRunningAsAdministrator();
    void SetBlockedDistractions(List<string> distractionTypes);
    bool EnableBlocking();
    bool DisableBlocking();
    bool IsBlocking();
    bool RecoverStaleBlocks();
    void BackupHostsFile();
    List<string> GetBlockedDomains();
    Dictionary<string, string[]> GetAvailableDistractionTypes();
}
