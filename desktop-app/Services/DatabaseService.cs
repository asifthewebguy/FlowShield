using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.Data.Sqlite;
using FlowShield.Desktop.Models;
using FlowShield.Desktop.Interfaces;
using Serilog;

namespace FlowShield.Desktop.Services
{
    public class DatabaseService : IDatabaseService
    {
        private string _connectionString;
        private readonly string _dbPath;

        public DatabaseService()
        {
            var appDataPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FlowShield"
            );
            Directory.CreateDirectory(appDataPath);

            _dbPath = Path.Combine(appDataPath, "flowshield.db");
            _connectionString = $"Data Source={_dbPath}";
        }

        /// <summary>Test-only constructor that uses a custom database path.</summary>
        internal DatabaseService(string dbPath)
        {
            var dir = Path.GetDirectoryName(dbPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            _dbPath = dbPath;
            _connectionString = $"Data Source={_dbPath}";
        }

        public void Initialize(string password = null)
        {
            var targetConnectionString = $"Data Source={_dbPath}";
            if (!string.IsNullOrEmpty(password))
            {
                targetConnectionString += $";Password={password}";
            }

            // check if we need to migrate from unencrypted to encrypted
            if (!string.IsNullOrEmpty(password) && File.Exists(_dbPath))
            {
                try
                {
                    // Try to open with the password
                    using var testConnection = new SqliteConnection(targetConnectionString);
                    testConnection.Open();
                    using var cmd = testConnection.CreateCommand();
                    cmd.CommandText = "SELECT count(*) FROM sqlite_master;";
                    cmd.ExecuteScalar();
                }
                catch (SqliteException ex) when (ex.SqliteErrorCode == 26) // file is not a database
                {
                    // This error indicates the file exists but isn't readable with the key.
                    // It likely means it's unencrypted. Let's try to encrypt it.
                    try
                    {
                        var plainConnectionString = $"Data Source={_dbPath}";
                        using var plainConnection = new SqliteConnection(plainConnectionString);
                        plainConnection.Open();

                        using var cmd = plainConnection.CreateCommand();
                        cmd.CommandText = $"PRAGMA rekey = '{password}';";
                        cmd.ExecuteNonQuery();
                    }
                    catch
                    {
                        // If that fails too, just throw the original exception
                        throw ex;
                    }
                }
            }

            // Update the instance connection string so all subsequent calls use the password
            _connectionString = targetConnectionString;

            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var createTableCmd = connection.CreateCommand();
            createTableCmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS ActivityLogs (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Timestamp TEXT NOT NULL,
                    WindowTitle TEXT NOT NULL,
                    ProcessName TEXT NOT NULL,
                    ApplicationName TEXT NOT NULL,
                    Url TEXT,
                    DurationSeconds INTEGER NOT NULL DEFAULT 0,
                    ActivityLevel INTEGER NOT NULL DEFAULT 0,
                    IsSynced INTEGER NOT NULL DEFAULT 0,
                    UserId TEXT,
                    SessionId TEXT,
                    Category INTEGER NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_timestamp ON ActivityLogs(Timestamp);
                CREATE INDEX IF NOT EXISTS idx_synced ON ActivityLogs(IsSynced);

                CREATE TABLE IF NOT EXISTS Settings (
                    Key TEXT PRIMARY KEY,
                    Value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS PendingOperations (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    OperationType TEXT NOT NULL,
                    Payload TEXT NOT NULL,
                    CreatedAt TEXT NOT NULL,
                    RetryCount INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS CategoryRules (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Keyword TEXT NOT NULL,
                    MatchField TEXT NOT NULL DEFAULT 'applicationName',
                    Category TEXT NOT NULL,
                    Priority INTEGER NOT NULL DEFAULT 100,
                    CachedAt TEXT NOT NULL
                );
            ";
            createTableCmd.ExecuteNonQuery();

            // Run migrations to update existing databases
            MigrateDatabase(connection);
        }

        private void MigrateDatabase(SqliteConnection connection)
        {
            // Check if ActivityLevel column exists, if not add it
            var checkColumnCmd = connection.CreateCommand();
            checkColumnCmd.CommandText = "PRAGMA table_info(ActivityLogs)";

            bool hasActivityLevel = false;
            bool hasSessionId = false;
            using (var reader = checkColumnCmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    var columnName = reader.GetString(1); // Column name is at index 1
                    if (columnName == "ActivityLevel") hasActivityLevel = true;
                    if (columnName == "SessionId") hasSessionId = true;
                }
            }

            // Add ActivityLevel column if it doesn't exist
            if (!hasActivityLevel)
            {
                var alterTableCmd = connection.CreateCommand();
                alterTableCmd.CommandText = "ALTER TABLE ActivityLogs ADD COLUMN ActivityLevel INTEGER NOT NULL DEFAULT 0";
                alterTableCmd.ExecuteNonQuery();
            }

            // Add SessionId column if it doesn't exist
            if (!hasSessionId)
            {
                var alterTableCmd = connection.CreateCommand();
                alterTableCmd.CommandText = "ALTER TABLE ActivityLogs ADD COLUMN SessionId TEXT";
                alterTableCmd.ExecuteNonQuery();
            }

            // Ensure CategoryRules table exists on older databases (also handled by CREATE TABLE IF NOT EXISTS above)
            var checkCategoryRulesCmd = connection.CreateCommand();
            checkCategoryRulesCmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name='CategoryRules'";
            var tableExists = checkCategoryRulesCmd.ExecuteScalar();
            if (tableExists == null)
            {
                var createCategoryRulesCmd = connection.CreateCommand();
                createCategoryRulesCmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS CategoryRules (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        Keyword TEXT NOT NULL,
                        MatchField TEXT NOT NULL DEFAULT 'applicationName',
                        Category TEXT NOT NULL,
                        Priority INTEGER NOT NULL DEFAULT 100,
                        CachedAt TEXT NOT NULL
                    )";
                createCategoryRulesCmd.ExecuteNonQuery();
            }
        }

        public void LogActivity(ActivityLog log)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = @"
                INSERT INTO ActivityLogs
                (Timestamp, WindowTitle, ProcessName, ApplicationName, Url, DurationSeconds, ActivityLevel, UserId, SessionId, Category)
                VALUES (@timestamp, @windowTitle, @processName, @appName, @url, @duration, @activityLevel, @userId, @sessionId, @category)
            ";

            command.Parameters.AddWithValue("@timestamp", log.Timestamp.ToString("o"));
            command.Parameters.AddWithValue("@windowTitle", log.WindowTitle);
            command.Parameters.AddWithValue("@processName", log.ProcessName);
            command.Parameters.AddWithValue("@appName", log.ApplicationName);
            command.Parameters.AddWithValue("@url", log.Url ?? string.Empty);
            command.Parameters.AddWithValue("@duration", log.DurationSeconds);
            command.Parameters.AddWithValue("@activityLevel", log.ActivityLevel);
            command.Parameters.AddWithValue("@userId", log.UserId ?? string.Empty);
            command.Parameters.AddWithValue("@sessionId", log.SessionId ?? string.Empty);
            command.Parameters.AddWithValue("@category", (int)log.Category);

            command.ExecuteNonQuery();
        }

        public List<ActivityLog> GetUnsyncedLogs()
        {
            var logs = new List<ActivityLog>();

            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = "SELECT * FROM ActivityLogs WHERE IsSynced = 0 ORDER BY Timestamp ASC LIMIT 1000";

            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                logs.Add(new ActivityLog
                {
                    Id = reader.GetInt32(0),
                    Timestamp = DateTime.Parse(reader.GetString(1)),
                    WindowTitle = reader.GetString(2),
                    ProcessName = reader.GetString(3),
                    ApplicationName = reader.GetString(4),
                    Url = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    DurationSeconds = reader.GetInt32(6),
                    ActivityLevel = reader.GetInt32(7),
                    IsSynced = reader.GetInt32(8) == 1,
                    UserId = reader.IsDBNull(9) ? null : reader.GetString(9),
                    SessionId = reader.IsDBNull(10) ? null : reader.GetString(10),
                    Category = (ActivityCategory)reader.GetInt32(11)
                });
            }

            return logs;
        }

        public void MarkAsSynced(List<int> logIds)
        {
            if (logIds.Count == 0) return;

            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            // Build parameterized query to prevent SQL injection
            var parameters = new List<string>();
            var command = connection.CreateCommand();

            for (int i = 0; i < logIds.Count; i++)
            {
                var paramName = $"@id{i}";
                parameters.Add(paramName);
                command.Parameters.AddWithValue(paramName, logIds[i]);
            }

            command.CommandText = $"UPDATE ActivityLogs SET IsSynced = 1 WHERE Id IN ({string.Join(",", parameters)})";
            command.ExecuteNonQuery();
        }

        public void SaveSetting(string key, string value)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = @"
                INSERT INTO Settings (Key, Value) VALUES (@key, @value)
                ON CONFLICT(Key) DO UPDATE SET Value = @value
            ";
            command.Parameters.AddWithValue("@key", key);
            command.Parameters.AddWithValue("@value", value);
            command.ExecuteNonQuery();
        }

        public string? GetSetting(string key)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = "SELECT Value FROM Settings WHERE Key = @key";
            command.Parameters.AddWithValue("@key", key);

            var result = command.ExecuteScalar();
            return result?.ToString();
        }

        public void QueuePendingOperation(string operationType, string payload)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = @"
                INSERT INTO PendingOperations (OperationType, Payload, CreatedAt)
                VALUES (@type, @payload, @createdAt)
            ";
            command.Parameters.AddWithValue("@type", operationType);
            command.Parameters.AddWithValue("@payload", payload);
            command.Parameters.AddWithValue("@createdAt", DateTime.UtcNow.ToString("o"));
            command.ExecuteNonQuery();

            // Enforce bounds after every insert
            PurgeOldPendingOperations();
            EnforceQueueLimit();
        }

        /// <summary>Removes pending operations older than <paramref name="maxAgeDays"/> days.</summary>
        public void PurgeOldPendingOperations(int maxAgeDays = 7)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var cutoff = DateTime.UtcNow.AddDays(-maxAgeDays).ToString("o");
            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM PendingOperations WHERE CreatedAt < @cutoff";
            command.Parameters.AddWithValue("@cutoff", cutoff);
            var deleted = command.ExecuteNonQuery();

            if (deleted > 0)
                Log.Warning("Purged {Count} pending operations older than {Days} days", deleted, maxAgeDays);
        }

        /// <summary>
        /// Trims the pending operations queue to at most <paramref name="maxEntries"/> entries,
        /// keeping the most recent ones.
        /// </summary>
        public void EnforceQueueLimit(int maxEntries = 500)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = @"
                DELETE FROM PendingOperations
                WHERE Id NOT IN (
                    SELECT Id FROM PendingOperations ORDER BY CreatedAt DESC LIMIT @max
                )";
            command.Parameters.AddWithValue("@max", maxEntries);
            var deleted = command.ExecuteNonQuery();

            if (deleted > 0)
                Log.Warning("Trimmed {Count} oldest pending operations to enforce {Max}-entry limit", deleted, maxEntries);
        }

        public List<PendingOperation> GetPendingOperations(int maxRetries = 5)
        {
            var ops = new List<PendingOperation>();

            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = "SELECT Id, OperationType, Payload, CreatedAt, RetryCount FROM PendingOperations WHERE RetryCount < @maxRetries ORDER BY CreatedAt ASC";
            command.Parameters.AddWithValue("@maxRetries", maxRetries);

            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                ops.Add(new PendingOperation
                {
                    Id = reader.GetInt32(0),
                    OperationType = reader.GetString(1),
                    Payload = reader.GetString(2),
                    CreatedAt = DateTime.Parse(reader.GetString(3)),
                    RetryCount = reader.GetInt32(4),
                });
            }

            return ops;
        }

        public void RemovePendingOperation(int id)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM PendingOperations WHERE Id = @id";
            command.Parameters.AddWithValue("@id", id);
            command.ExecuteNonQuery();
        }

        public void IncrementRetryCount(int id)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = "UPDATE PendingOperations SET RetryCount = RetryCount + 1 WHERE Id = @id";
            command.Parameters.AddWithValue("@id", id);
            command.ExecuteNonQuery();
        }

        public Dictionary<string, int> GetTodayStats()
        {
            var stats = new Dictionary<string, int>();
            var today = DateTime.Today.ToString("yyyy-MM-dd");


            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = @"
                SELECT
                    COUNT(*) as TotalLogs,
                    SUM(DurationSeconds) as TotalSeconds,
                    COUNT(DISTINCT ProcessName) as UniqueApps
                FROM ActivityLogs
                WHERE DATE(Timestamp) = @today
            ";
            command.Parameters.AddWithValue("@today", today);

            using var reader = command.ExecuteReader();
            if (reader.Read())
            {
                stats["TotalLogs"] = reader.GetInt32(0);
                stats["TotalSeconds"] = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
                stats["UniqueApps"] = reader.GetInt32(2);
            }

            return stats;
        }

        public List<CategoryRuleModel> GetCachedCategoryRules()
        {
            var rules = new List<CategoryRuleModel>();
            try
            {
                using var connection = new SqliteConnection(_connectionString);
                connection.Open();
                var cmd = connection.CreateCommand();
                cmd.CommandText = "SELECT Keyword, MatchField, Category, Priority FROM CategoryRules ORDER BY Priority DESC";
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    rules.Add(new CategoryRuleModel
                    {
                        Keyword = reader.GetString(0),
                        MatchField = reader.GetString(1),
                        Category = reader.GetString(2),
                        Priority = reader.GetInt32(3),
                    });
                }
            }
            catch { }
            return rules;
        }

        public void SaveCategoryRules(List<CategoryRuleModel> rules)
        {
            try
            {
                using var connection = new SqliteConnection(_connectionString);
                connection.Open();
                using var transaction = connection.BeginTransaction();

                var deleteCmd = connection.CreateCommand();
                deleteCmd.CommandText = "DELETE FROM CategoryRules";
                deleteCmd.ExecuteNonQuery();

                var cachedAt = DateTime.UtcNow.ToString("o");
                foreach (var rule in rules)
                {
                    var insertCmd = connection.CreateCommand();
                    insertCmd.CommandText = "INSERT INTO CategoryRules (Keyword, MatchField, Category, Priority, CachedAt) VALUES (@k, @mf, @cat, @pri, @ca)";
                    insertCmd.Parameters.AddWithValue("@k", rule.Keyword);
                    insertCmd.Parameters.AddWithValue("@mf", rule.MatchField);
                    insertCmd.Parameters.AddWithValue("@cat", rule.Category);
                    insertCmd.Parameters.AddWithValue("@pri", rule.Priority);
                    insertCmd.Parameters.AddWithValue("@ca", cachedAt);
                    insertCmd.ExecuteNonQuery();
                }

                transaction.Commit();
            }
            catch { }
        }

        public DateTime? GetLastCategoryRuleSync()
        {
            var val = GetSetting("LastCategoryRuleSync");
            if (val == null) return null;
            return DateTime.TryParse(val, out var dt) ? dt : (DateTime?)null;
        }

        public void UpdateLastCategoryRuleSync(DateTime dt)
        {
            SaveSetting("LastCategoryRuleSync", dt.ToString("o"));
        }
    }

    public class PendingOperation
    {
        public int Id { get; set; }
        public string OperationType { get; set; } = string.Empty;
        public string Payload { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public int RetryCount { get; set; }
    }
}
