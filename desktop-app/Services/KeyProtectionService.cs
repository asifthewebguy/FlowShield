using System;
using System.IO;
using System.Security.Cryptography;
using Microsoft.Data.Sqlite;

namespace FlowShield.Desktop.Services
{
    public static class KeyProtectionService
    {
        public static readonly string KeyFilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FlowShield",
            "key.dat"
        );

        /// <summary>
        /// Gets the existing DPAPI-protected key or creates a new one.
        /// Returns the key as a base64 string suitable for use as a database password.
        /// </summary>
        public static string GetOrCreateKey()
        {
            var keyDir = Path.GetDirectoryName(KeyFilePath)!;
            Directory.CreateDirectory(keyDir);

            if (File.Exists(KeyFilePath))
            {
                var protectedBytes = File.ReadAllBytes(KeyFilePath);
                var keyBytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                return Convert.ToBase64String(keyBytes);
            }

            // Generate a new 32-byte random key
            var newKey = new byte[32];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(newKey);
            }

            // Protect with DPAPI and save
            var encrypted = ProtectedData.Protect(newKey, null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(KeyFilePath, encrypted);

            return Convert.ToBase64String(newKey);
        }

        /// <summary>
        /// Migrates a database from a hardcoded key to the DPAPI-protected key.
        /// Opens the DB with the old key and re-encrypts with the new key using PRAGMA rekey.
        /// </summary>
        public static void MigrateFromHardcodedKey(string dbPath, string oldKey)
        {
            var newKey = GetOrCreateKey();

            var connectionString = $"Data Source={dbPath};Password={oldKey}";
            using var connection = new SqliteConnection(connectionString);
            connection.Open();

            // Verify we can read the database with the old key
            using var verifyCmd = connection.CreateCommand();
            verifyCmd.CommandText = "SELECT count(*) FROM sqlite_master;";
            verifyCmd.ExecuteScalar();

            // Re-encrypt with the new key
            using var rekeyCmd = connection.CreateCommand();
            rekeyCmd.CommandText = $"PRAGMA rekey = '{newKey}';";
            rekeyCmd.ExecuteNonQuery();
        }
    }
}
