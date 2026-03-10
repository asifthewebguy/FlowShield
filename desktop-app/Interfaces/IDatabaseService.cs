using System.Collections.Generic;
using FlowShield.Desktop.Models;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.Interfaces;

public interface IDatabaseService
{
    void Initialize(string? password = null);
    void LogActivity(ActivityLog log);
    List<ActivityLog> GetUnsyncedLogs();
    void MarkAsSynced(List<int> logIds);
    void SaveSetting(string key, string value);
    string? GetSetting(string key);
    void QueuePendingOperation(string operationType, string payload);
    List<PendingOperation> GetPendingOperations(int maxRetries = 5);
    void RemovePendingOperation(int id);
    void IncrementRetryCount(int id);
    Dictionary<string, int> GetTodayStats();
}
