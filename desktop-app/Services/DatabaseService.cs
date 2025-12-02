using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.Data.Sqlite;
using FlowShield.Desktop.Models;

namespace FlowShield.Desktop.Services
{
    public class DatabaseService
    {
        private readonly string _connectionString;
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

        public void Initialize()
        {
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
            using (var reader = checkColumnCmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    var columnName = reader.GetString(1); // Column name is at index 1
                    if (columnName == "ActivityLevel")
                    {
                        hasActivityLevel = true;
                        break;
                    }
                }
            }

            // Add ActivityLevel column if it doesn't exist
            if (!hasActivityLevel)
            {
                var alterTableCmd = connection.CreateCommand();
                alterTableCmd.CommandText = "ALTER TABLE ActivityLogs ADD COLUMN ActivityLevel INTEGER NOT NULL DEFAULT 0";
                alterTableCmd.ExecuteNonQuery();
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
    }
}
