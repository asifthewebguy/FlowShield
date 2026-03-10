using FlowShield.Desktop.Services;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class WebsiteBlockerTests
{
    private readonly WebsiteBlocker _blocker;

    public WebsiteBlockerTests()
    {
        _blocker = new WebsiteBlocker();
    }

    [Fact]
    public void GetAvailableDistractionTypes_ReturnsAllCategories()
    {
        var types = _blocker.GetAvailableDistractionTypes();

        Assert.True(types.Count >= 6);
        Assert.True(types.ContainsKey("Social Media"));
        Assert.True(types.ContainsKey("Video Streaming"));
        Assert.True(types.ContainsKey("Email"));
        Assert.True(types.ContainsKey("Messaging"));
        Assert.True(types.ContainsKey("News Sites"));
        Assert.True(types.ContainsKey("Shopping"));
    }

    [Fact]
    public void SetBlockedDistractions_SocialMedia_PopulatesDomains()
    {
        _blocker.SetBlockedDistractions(new List<string> { "Social Media" });
        var domains = _blocker.GetBlockedDomains();

        Assert.Contains("facebook.com", domains);
        Assert.Contains("twitter.com", domains);
        Assert.Contains("instagram.com", domains);
        Assert.Contains("reddit.com", domains);
    }

    [Fact]
    public void SetBlockedDistractions_MultipleCategories_CombinesDomains()
    {
        _blocker.SetBlockedDistractions(new List<string> { "Social Media", "Video Streaming" });
        var domains = _blocker.GetBlockedDomains();

        Assert.Contains("facebook.com", domains);
        Assert.Contains("youtube.com", domains);
        Assert.Contains("netflix.com", domains);
    }

    [Fact]
    public void SetBlockedDistractions_InvalidCategory_NoDomainsAdded()
    {
        _blocker.SetBlockedDistractions(new List<string> { "Nonexistent Category" });
        var domains = _blocker.GetBlockedDomains();
        Assert.Empty(domains);
    }

    [Fact]
    public void SetBlockedDistractions_ClearsPreviousSelection()
    {
        _blocker.SetBlockedDistractions(new List<string> { "Social Media" });
        _blocker.SetBlockedDistractions(new List<string> { "Shopping" });
        var domains = _blocker.GetBlockedDomains();

        Assert.DoesNotContain("facebook.com", domains);
        Assert.Contains("amazon.com", domains);
    }

    [Fact]
    public void GetBlockedDomains_ReturnsDistinctDomains()
    {
        // News Sites and Social Media both include reddit.com
        _blocker.SetBlockedDistractions(new List<string> { "Social Media", "News Sites" });
        var domains = _blocker.GetBlockedDomains();

        var redditCount = domains.Count(d => d == "reddit.com");
        Assert.Equal(1, redditCount);
    }
}
