using FlowShield.Desktop.Services;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class UpdateServiceTests
{
    [Theory]
    [InlineData("2.0.0", "1.7.0", true)]
    [InlineData("1.8.0", "1.7.0", true)]
    [InlineData("1.7.1", "1.7.0", true)]
    [InlineData("3.0.0", "1.7.0", true)]
    public void IsNewerVersion_NewerVersion_ReturnsTrue(string latest, string current, bool expected)
    {
        Assert.Equal(expected, UpdateService.IsNewerVersion(latest, current));
    }

    [Theory]
    [InlineData("1.7.0", "1.7.0")]
    [InlineData("1.6.0", "1.7.0")]
    [InlineData("1.7.0", "2.0.0")]
    [InlineData("0.9.9", "1.0.0")]
    public void IsNewerVersion_SameOrOlder_ReturnsFalse(string latest, string current)
    {
        Assert.False(UpdateService.IsNewerVersion(latest, current));
    }

    [Theory]
    [InlineData("", "1.7.0")]
    [InlineData(null, "1.7.0")]
    public void IsNewerVersion_EmptyOrNull_ReturnsFalse(string? latest, string current)
    {
        Assert.False(UpdateService.IsNewerVersion(latest!, current));
    }

    [Theory]
    [InlineData("v2.0.0", "1.7.0", true)]
    [InlineData("v1.7.0", "1.7.0", false)]
    public void IsNewerVersion_WithVPrefix_HandledCorrectly(string latest, string current, bool expected)
    {
        // ParseVersion strips non-numeric chars via regex
        Assert.Equal(expected, UpdateService.IsNewerVersion(latest, current));
    }

    [Fact]
    public void ParseVersion_ValidVersion_ReturnsCorrectParts()
    {
        var parts = UpdateService.ParseVersion("1.7.3");
        Assert.Equal(new[] { 1, 7, 3 }, parts);
    }

    [Fact]
    public void ParseVersion_VersionWithPrefix_StripsNonNumeric()
    {
        var parts = UpdateService.ParseVersion("v2.1.0");
        Assert.Equal(new[] { 2, 1, 0 }, parts);
    }

    [Fact]
    public void ParseVersion_EmptyString_ReturnsZeros()
    {
        var parts = UpdateService.ParseVersion("");
        Assert.Equal(new[] { 0, 0, 0 }, parts);
    }

    [Fact]
    public void ParseVersion_PartialVersion_PadsWithZeros()
    {
        var parts = UpdateService.ParseVersion("2.1");
        Assert.Equal(new[] { 2, 1, 0 }, parts);
    }
}
