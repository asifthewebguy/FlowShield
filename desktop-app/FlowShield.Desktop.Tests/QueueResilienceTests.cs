using FlowShield.Desktop.Services;
using Microsoft.Data.Sqlite;
using System.IO;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class QueueResilienceTests : IDisposable
{
    private readonly string _dbPath;
    private readonly DatabaseService _db;

    public QueueResilienceTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"flowshield_queue_test_{Guid.NewGuid():N}.db");
        _db = new DatabaseService(_dbPath);
        _db.Initialize();
    }

    public void Dispose()
    {
        // Clear SQLite connection pool to release file locks before deletion
        SqliteConnection.ClearAllPools();
        if (File.Exists(_dbPath)) File.Delete(_dbPath);
    }

    [Fact]
    public void PurgeOldPendingOperations_RemovesEntriesOlderThanCutoff()
    {
        // Manually insert an old entry (9 days ago)
        InsertOperationWithDate("OLD_OP", DateTime.UtcNow.AddDays(-9).ToString("o"));
        InsertOperationWithDate("NEW_OP", DateTime.UtcNow.AddDays(-1).ToString("o"));

        _db.PurgeOldPendingOperations(maxAgeDays: 7);

        var ops = _db.GetPendingOperations();
        Assert.DoesNotContain(ops, o => o.OperationType == "OLD_OP");
        Assert.Contains(ops, o => o.OperationType == "NEW_OP");
    }

    [Fact]
    public void PurgeOldPendingOperations_KeepsRecentEntries()
    {
        InsertOperationWithDate("RECENT_OP", DateTime.UtcNow.AddDays(-2).ToString("o"));

        _db.PurgeOldPendingOperations(maxAgeDays: 7);

        var ops = _db.GetPendingOperations();
        Assert.Contains(ops, o => o.OperationType == "RECENT_OP");
    }

    [Fact]
    public void EnforceQueueLimit_RemovesOldestWhenOverLimit()
    {
        // Insert 5 ops with staggered timestamps, limit to 3
        for (int i = 1; i <= 5; i++)
        {
            InsertOperationWithDate($"OP_{i}", DateTime.UtcNow.AddMinutes(-i * 10).ToString("o"));
        }

        _db.EnforceQueueLimit(maxEntries: 3);

        var ops = _db.GetPendingOperations();
        Assert.Equal(3, ops.Count);
        // The 3 newest (OP_1, OP_2, OP_3) should survive; OP_4 and OP_5 are oldest
        Assert.DoesNotContain(ops, o => o.OperationType == "OP_4");
        Assert.DoesNotContain(ops, o => o.OperationType == "OP_5");
    }

    [Fact]
    public void EnforceQueueLimit_NoOpsWhenUnderLimit()
    {
        InsertOperationWithDate("OP_1", DateTime.UtcNow.ToString("o"));
        InsertOperationWithDate("OP_2", DateTime.UtcNow.AddMinutes(-5).ToString("o"));

        _db.EnforceQueueLimit(maxEntries: 500);

        var ops = _db.GetPendingOperations();
        Assert.Equal(2, ops.Count);
    }

    [Fact]
    public void QueuePendingOperation_AutoPurgesStaleEntries()
    {
        // Insert a stale entry directly
        InsertOperationWithDate("STALE_OP", DateTime.UtcNow.AddDays(-10).ToString("o"));

        // QueuePendingOperation should trigger purge automatically
        _db.QueuePendingOperation("FRESH_OP", "{}");

        var ops = _db.GetPendingOperations();
        Assert.DoesNotContain(ops, o => o.OperationType == "STALE_OP");
        Assert.Contains(ops, o => o.OperationType == "FRESH_OP");
    }

    /// <summary>Directly inserts a PendingOperation row with a specific CreatedAt timestamp (bypassing QueuePendingOperation's auto-purge).</summary>
    private void InsertOperationWithDate(string type, string createdAt)
    {
        using var conn = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={_dbPath}");
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "INSERT INTO PendingOperations (OperationType, Payload, CreatedAt, RetryCount) VALUES (@t, '{}', @c, 0)";
        cmd.Parameters.AddWithValue("@t", type);
        cmd.Parameters.AddWithValue("@c", createdAt);
        cmd.ExecuteNonQuery();
    }
}
