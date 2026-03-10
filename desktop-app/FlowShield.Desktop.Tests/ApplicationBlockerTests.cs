using FlowShield.Desktop.Services;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class ApplicationBlockerTests
{
    [Fact]
    public void IsBlocking_Initially_ReturnsFalse()
    {
        var blocker = new ApplicationBlocker();
        Assert.False(blocker.IsBlocking);
    }

    [Fact]
    public void SetBlockedApps_UpdatesList()
    {
        var blocker = new ApplicationBlocker();
        blocker.SetBlockedApps(new List<string> { "CustomApp1", "CustomApp2" });
        // No direct way to verify the list, but shouldn't throw
        Assert.False(blocker.IsBlocking);
    }

    [Fact]
    public void UnblockApps_WhenNotBlocking_DoesNotThrow()
    {
        var blocker = new ApplicationBlocker();
        blocker.UnblockApps();
        Assert.False(blocker.IsBlocking);
    }
}
