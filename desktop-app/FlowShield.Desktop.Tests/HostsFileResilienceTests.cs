using FlowShield.Desktop.Services;
using System.IO;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class HostsFileResilienceTests : IDisposable
{
    private readonly string _hostsFile;
    private readonly string _backupFile;
    private readonly WebsiteBlocker _blocker;

    public HostsFileResilienceTests()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), $"flowshield_hosts_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tmpDir);
        _hostsFile = Path.Combine(tmpDir, "hosts");
        _backupFile = Path.Combine(tmpDir, "hosts.backup");

        // Write a minimal valid hosts file
        File.WriteAllText(_hostsFile, "127.0.0.1 localhost\n");

        _blocker = new WebsiteBlocker(_hostsFile, _backupFile);
    }

    public void Dispose()
    {
        var dir = Path.GetDirectoryName(_hostsFile)!;
        if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
    }

    [Fact]
    public void BackupHostsFile_CreatesBackupAtExpectedPath()
    {
        _blocker.BackupHostsFile();

        Assert.True(File.Exists(_backupFile));
    }

    [Fact]
    public void BackupHostsFile_BackupContainsSameContentAsOriginal()
    {
        var original = File.ReadAllText(_hostsFile);
        _blocker.BackupHostsFile();
        var backup = File.ReadAllText(_backupFile);

        Assert.Equal(original, backup);
    }

    [Fact]
    public void BackupHostsFile_OverwritesExistingBackup()
    {
        File.WriteAllText(_backupFile, "old content");
        File.WriteAllText(_hostsFile, "new content");

        _blocker.BackupHostsFile();

        Assert.Equal("new content", File.ReadAllText(_backupFile));
    }

    [Fact]
    public void HasStaleBlocks_WhenNoFlowShieldMarkers_ReturnsFalse()
    {
        // Hosts file contains no FlowShield entries
        Assert.False(_blocker.HasStaleBlocks());
    }

    [Fact]
    public void HasStaleBlocks_WhenFlowShieldMarkerPresent_ReturnsTrue()
    {
        File.AppendAllText(_hostsFile, "127.0.0.1 facebook.com # FlowShield Block\n");

        Assert.True(_blocker.HasStaleBlocks());
    }

    [Fact]
    public void HasStaleBlocks_WhenHostsFileDoesNotExist_ReturnsFalse()
    {
        File.Delete(_hostsFile);

        Assert.False(_blocker.HasStaleBlocks());
    }

    [Fact]
    public void RecoverStaleBlocks_WhenNoStaleBlocks_ReturnsFalse()
    {
        // No markers → nothing to recover
        var result = _blocker.RecoverStaleBlocks();
        Assert.False(result);
    }
}
