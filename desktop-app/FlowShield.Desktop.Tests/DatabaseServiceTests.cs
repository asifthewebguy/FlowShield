using System.IO;
using FlowShield.Desktop.Models;
using FlowShield.Desktop.Services;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class DatabaseServiceTests : IDisposable
{
    private readonly DatabaseService _db;
    private readonly string _tempDbPath;

    public DatabaseServiceTests()
    {
        _tempDbPath = Path.Combine(Path.GetTempPath(), "FlowShield.Tests", $"test_{Guid.NewGuid()}.db");
        _db = new DatabaseService(_tempDbPath);
        _db.Initialize(); // No password — plain SQLite for tests
    }

    public void Dispose()
    {
        try { File.Delete(_tempDbPath); } catch { }
    }

    [Fact]
    public void SaveSetting_And_GetSetting_Roundtrip()
    {
        _db.SaveSetting("TestKey", "TestValue");
        var result = _db.GetSetting("TestKey");
        Assert.Equal("TestValue", result);
    }

    [Fact]
    public void SaveSetting_Upserts_ExistingKey()
    {
        _db.SaveSetting("UpsertKey", "Original");
        _db.SaveSetting("UpsertKey", "Updated");
        Assert.Equal("Updated", _db.GetSetting("UpsertKey"));
    }

    [Fact]
    public void GetSetting_NonExistentKey_ReturnsNull()
    {
        var result = _db.GetSetting("NonExistentKey_" + Guid.NewGuid());
        Assert.Null(result);
    }

    [Fact]
    public void LogActivity_And_GetUnsyncedLogs_ReturnsLog()
    {
        var log = new ActivityLog
        {
            Timestamp = DateTime.Now,
            WindowTitle = "Test Window",
            ProcessName = "testprocess",
            ApplicationName = "Test App",
            DurationSeconds = 30,
            ActivityLevel = 50,
            Category = ActivityCategory.Development
        };

        _db.LogActivity(log);
        var unsynced = _db.GetUnsyncedLogs();

        Assert.Contains(unsynced, l => l.WindowTitle == "Test Window" && l.ProcessName == "testprocess");
    }

    [Fact]
    public void MarkAsSynced_RemovesFromUnsyncedList()
    {
        var log = new ActivityLog
        {
            Timestamp = DateTime.Now,
            WindowTitle = "SyncTest_" + Guid.NewGuid(),
            ProcessName = "synctest",
            ApplicationName = "SyncTest",
            DurationSeconds = 10,
            Category = ActivityCategory.Unknown
        };

        _db.LogActivity(log);
        var unsynced = _db.GetUnsyncedLogs();
        var ids = unsynced.Where(l => l.WindowTitle == log.WindowTitle).Select(l => l.Id).ToList();

        Assert.NotEmpty(ids);
        _db.MarkAsSynced(ids);

        var afterSync = _db.GetUnsyncedLogs();
        Assert.DoesNotContain(afterSync, l => l.WindowTitle == log.WindowTitle);
    }

    [Fact]
    public void QueuePendingOperation_And_GetPendingOperations()
    {
        _db.QueuePendingOperation("START_SESSION", "{\"test\": true}");

        var ops = _db.GetPendingOperations();
        Assert.Contains(ops, o => o.OperationType == "START_SESSION");
    }

    [Fact]
    public void RemovePendingOperation_RemovesIt()
    {
        _db.QueuePendingOperation("END_SESSION", "{\"remove\": true}");

        var ops = _db.GetPendingOperations();
        var op = ops.First(o => o.OperationType == "END_SESSION");

        _db.RemovePendingOperation(op.Id);

        var afterRemove = _db.GetPendingOperations();
        Assert.DoesNotContain(afterRemove, o => o.Id == op.Id);
    }

    [Fact]
    public void IncrementRetryCount_IncrementsCount()
    {
        _db.QueuePendingOperation("START_SESSION", "{\"retry\": true}");

        var ops = _db.GetPendingOperations();
        var op = ops.First();
        Assert.Equal(0, op.RetryCount);

        _db.IncrementRetryCount(op.Id);
        _db.IncrementRetryCount(op.Id);

        var updated = _db.GetPendingOperations(maxRetries: 10);
        var updatedOp = updated.First(o => o.Id == op.Id);
        Assert.Equal(2, updatedOp.RetryCount);
    }

    [Fact]
    public void GetPendingOperations_ExcludesExceededRetries()
    {
        _db.QueuePendingOperation("START_SESSION", "{\"maxretry\": true}");

        var ops = _db.GetPendingOperations();
        var op = ops.First();

        // Increment to 5 (default max)
        for (int i = 0; i < 5; i++)
            _db.IncrementRetryCount(op.Id);

        var afterMax = _db.GetPendingOperations(maxRetries: 5);
        Assert.DoesNotContain(afterMax, o => o.Id == op.Id);
    }

    [Fact]
    public void GetTodayStats_ReturnsStats()
    {
        var stats = _db.GetTodayStats();
        Assert.True(stats.ContainsKey("TotalLogs"));
        Assert.True(stats.ContainsKey("TotalSeconds"));
        Assert.True(stats.ContainsKey("UniqueApps"));
    }
}
