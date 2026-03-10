using FlowShield.Desktop.Models;
using FlowShield.Desktop.Services;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class ActivityCategorizationTests
{
    private readonly ActivityTracker _tracker;

    public ActivityCategorizationTests()
    {
        // ActivityTracker requires a DatabaseService, but CategorizeActivity is pure logic
        // We use a real DatabaseService pointed at a temp DB that we never use
        var db = new DatabaseService();
        _tracker = new ActivityTracker(db);
    }

    [Theory]
    [InlineData("code", "Program.cs - Visual Studio Code", ActivityCategory.Development)]
    [InlineData("devenv", "Solution Explorer - Visual Studio", ActivityCategory.Development)]
    [InlineData("rider", "FlowShield.sln - JetBrains Rider", ActivityCategory.Development)]
    [InlineData("eclipse", "Java - Eclipse IDE", ActivityCategory.Development)]
    public void CategorizeActivity_DevelopmentTools_ReturnsDevelopment(string process, string title, ActivityCategory expected)
    {
        var result = _tracker.CategorizeActivity(process, title);
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("slack", "general - Slack")]
    [InlineData("teams", "Meeting - Microsoft Teams")]
    [InlineData("discord", "Server - Discord")]
    [InlineData("outlook", "Inbox - Outlook")]
    [InlineData("thunderbird", "Mozilla Thunderbird")]
    public void CategorizeActivity_CommunicationApps_ReturnsCommunication(string process, string title)
    {
        var result = _tracker.CategorizeActivity(process, title);
        Assert.Equal(ActivityCategory.Communication, result);
    }

    [Theory]
    [InlineData("chrome", "YouTube - Google Chrome", ActivityCategory.Entertainment)]
    [InlineData("firefox", "Netflix - Mozilla Firefox", ActivityCategory.Entertainment)]
    [InlineData("chrome", "Facebook - Google Chrome", ActivityCategory.Social)]
    [InlineData("chrome", "reddit - the front page - Google Chrome", ActivityCategory.Social)]
    [InlineData("chrome", "GitHub - asifthewebguy - Google Chrome", ActivityCategory.Development)]
    [InlineData("chrome", "docs.microsoft.com - Google Chrome", ActivityCategory.Development)]
    [InlineData("chrome", "Some Random Page - Google Chrome", ActivityCategory.Browsing)]
    public void CategorizeActivity_BrowserTitles_CategorizesByContent(string process, string title, ActivityCategory expected)
    {
        var result = _tracker.CategorizeActivity(process, title);
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("excel", "Budget.xlsx - Excel")]
    [InlineData("word", "Report.docx - Word")]
    [InlineData("notion", "Workspace - Notion")]
    public void CategorizeActivity_ProductivityApps_ReturnsProductivity(string process, string title)
    {
        var result = _tracker.CategorizeActivity(process, title);
        Assert.Equal(ActivityCategory.Productivity, result);
    }

    [Fact]
    public void CategorizeActivity_UnknownApp_ReturnsUnknown()
    {
        var result = _tracker.CategorizeActivity("notepad", "Untitled - Notepad");
        Assert.Equal(ActivityCategory.Unknown, result);
    }

    [Fact]
    public void CategorizeActivity_GmailInTitle_ReturnsCommunication()
    {
        // gmail is matched by title, not process name
        var result = _tracker.CategorizeActivity("someprocess", "Inbox - Gmail");
        Assert.Equal(ActivityCategory.Communication, result);
    }
}
