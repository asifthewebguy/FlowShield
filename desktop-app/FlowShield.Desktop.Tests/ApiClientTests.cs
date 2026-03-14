using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using FlowShield.Desktop.Interfaces;
using FlowShield.Desktop.Models;
using FlowShield.Desktop.Services;
using Moq;
using Newtonsoft.Json;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class ApiClientTests
{
    // ---------- helpers ----------

    private static Mock<IDatabaseService> EmptyDb()
    {
        var db = new Mock<IDatabaseService>();
        db.Setup(d => d.GetSetting(It.IsAny<string>())).Returns((string?)null);
        return db;
    }

    private static Mock<IDatabaseService> AuthenticatedDb(string token = "test-token")
    {
        var db = new Mock<IDatabaseService>();
        db.Setup(d => d.GetSetting("AuthToken")).Returns(token);
        db.Setup(d => d.GetSetting(It.Is<string>(k => k != "AuthToken"))).Returns((string?)null);
        return db;
    }

    private static ApiClient BuildClient(Mock<IDatabaseService> db, FakeHttpHandler handler)
        => new ApiClient(db.Object, handler);

    private static string Json(object obj) => JsonConvert.SerializeObject(obj);

    // ---------- IsAuthenticated ----------

    [Fact]
    public void IsAuthenticated_WhenNoToken_ReturnsFalse()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());
        Assert.False(client.IsAuthenticated());
    }

    [Fact]
    public void IsAuthenticated_WhenTokenExists_ReturnsTrue()
    {
        var client = BuildClient(AuthenticatedDb(), new FakeHttpHandler());
        Assert.True(client.IsAuthenticated());
    }

    // ---------- LoginAsync ----------

    [Fact]
    public async Task LoginAsync_WhenSuccess_SavesTokenAndReturnsTrue()
    {
        var db = EmptyDb();
        var handler = new FakeHttpHandler(HttpStatusCode.OK,
            Json(new { token = "new-token", userId = "user-1" }));
        var client = BuildClient(db, handler);

        var result = await client.LoginAsync("test@test.com", "pass", rememberMe: false);

        Assert.True(result);
        db.Verify(d => d.SaveSetting("AuthToken", "new-token"), Times.Once);
        db.Verify(d => d.SaveSetting("UserId", "user-1"), Times.Once);
        db.Verify(d => d.SaveSetting("UserEmail", "test@test.com"), Times.Once);
    }

    [Fact]
    public async Task LoginAsync_WhenServerReturns401_ReturnsFalse()
    {
        var db = EmptyDb();
        var handler = new FakeHttpHandler(HttpStatusCode.Unauthorized, "");
        var client = BuildClient(db, handler);

        var result = await client.LoginAsync("bad@test.com", "wrong", rememberMe: false);

        Assert.False(result);
    }

    [Fact]
    public async Task LoginAsync_WhenNetworkError_ReturnsFalse()
    {
        var db = EmptyDb();
        var handler = new FakeHttpHandler(new HttpRequestException("no network"));
        var client = BuildClient(db, handler);

        var result = await client.LoginAsync("test@test.com", "pass", rememberMe: false);

        Assert.False(result);
    }

    // ---------- StartSessionAsync ----------

    [Fact]
    public async Task StartSessionAsync_WhenUnauthenticated_Throws()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.StartSessionAsync(25));
    }

    [Fact]
    public async Task StartSessionAsync_WhenSuccess_ReturnsSession()
    {
        var db = AuthenticatedDb();
        var session = new { id = "s-1", plannedDuration = 25, startTime = DateTime.UtcNow, completed = false };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(new { session }));
        var client = BuildClient(db, handler);

        var result = await client.StartSessionAsync(25);

        Assert.NotNull(result);
        Assert.Equal("s-1", result!.Id);
    }

    [Fact]
    public async Task StartSessionAsync_WhenUnauthorized_RaisesSessionExpiredAndThrows()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.Unauthorized, "");
        var client = BuildClient(db, handler);

        var eventFired = false;
        client.SessionExpired += (_, _) => eventFired = true;

        await Assert.ThrowsAsync<UnauthorizedAccessException>(
            () => client.StartSessionAsync(25));
        Assert.True(eventFired);
    }

    // ---------- EndSessionAsync ----------

    [Fact]
    public async Task EndSessionAsync_WhenSuccess_ReturnsTrue()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.OK, "{}");
        var client = BuildClient(db, handler);

        var result = await client.EndSessionAsync("sess-1");

        Assert.True(result);
    }

    [Fact]
    public async Task EndSessionAsync_WhenUnauthenticated_ReturnsFalse()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        var result = await client.EndSessionAsync("sess-1");

        Assert.False(result);
    }

    [Fact]
    public async Task EndSessionAsync_WhenNetworkError_ReturnsFalse()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(new HttpRequestException("network error"));
        var client = BuildClient(db, handler);

        var result = await client.EndSessionAsync("sess-1");

        Assert.False(result);
    }

    // ---------- GetActiveSessionAsync ----------

    [Fact]
    public async Task GetActiveSessionAsync_WhenSessionIsActive_ReturnsSession()
    {
        var db = AuthenticatedDb();
        var now = DateTime.UtcNow;
        var sessions = new[]
        {
            new { id = "s-active", plannedDuration = 25, startTime = now.AddMinutes(-5),
                  endTime = (DateTime?)null, completed = false }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(new { sessions }));
        var client = BuildClient(db, handler);

        var result = await client.GetActiveSessionAsync();

        Assert.NotNull(result);
        Assert.Equal("s-active", result!.Id);
    }

    [Fact]
    public async Task GetActiveSessionAsync_WhenSessionCompleted_ReturnsNull()
    {
        var db = AuthenticatedDb();
        var sessions = new[]
        {
            new { id = "s-done", plannedDuration = 25, startTime = DateTime.UtcNow.AddHours(-1),
                  endTime = (DateTime?)DateTime.UtcNow.AddMinutes(-35), completed = true }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(new { sessions }));
        var client = BuildClient(db, handler);

        var result = await client.GetActiveSessionAsync();

        Assert.Null(result);
    }

    [Fact]
    public async Task GetActiveSessionAsync_WhenNoSessions_ReturnsNull()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(new { sessions = Array.Empty<object>() }));
        var client = BuildClient(db, handler);

        var result = await client.GetActiveSessionAsync();

        Assert.Null(result);
    }

    [Fact]
    public async Task GetActiveSessionAsync_WhenUnauthenticated_ReturnsNull()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        var result = await client.GetActiveSessionAsync();

        Assert.Null(result);
    }

    // ---------- SyncActivitiesAsync ----------

    [Fact]
    public async Task SyncActivitiesAsync_WhenNoUnsyncedLogs_ReturnsTrue()
    {
        var db = AuthenticatedDb();
        db.Setup(d => d.GetUnsyncedLogs()).Returns(new List<ActivityLog>());
        var handler = new FakeHttpHandler(HttpStatusCode.OK, "{}");
        var client = BuildClient(db, handler);

        var result = await client.SyncActivitiesAsync();

        Assert.True(result);
        // No HTTP call needed when queue is empty
        Assert.Equal(0, handler.CallCount);
    }

    [Fact]
    public async Task SyncActivitiesAsync_WhenUnauthenticated_Throws()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.SyncActivitiesAsync());
    }

    // ---------- GetUserPreferencesAsync ----------

    [Fact]
    public async Task GetUserPreferencesAsync_WhenSuccess_ReturnsPreferences()
    {
        var db = AuthenticatedDb();
        var prefs = new { id = "p-1", userId = "u-1", preferredDuration = 25,
                          primaryDistractions = new[] { "Social Media", "Gaming" } };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(new { preferences = prefs }));
        var client = BuildClient(db, handler);

        var result = await client.GetUserPreferencesAsync();

        Assert.NotNull(result);
        Assert.Equal(2, result!.PrimaryDistractions!.Count);
        Assert.Contains("Social Media", result.PrimaryDistractions);
    }

    [Fact]
    public async Task GetUserPreferencesAsync_WhenUnauthenticated_ReturnsNull()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        var result = await client.GetUserPreferencesAsync();

        Assert.Null(result);
    }

    // ---------- GetGoalsAsync ----------

    [Fact]
    public async Task GetGoalsAsync_WhenSuccess_ReturnsGoals()
    {
        var db = AuthenticatedDb();
        var payload = new
        {
            goals = new[]
            {
                new { id = "g-1", goalType = "DAILY_TIME", targetValue = 120, currentValue = 60,
                      active = true, startDate = DateTime.UtcNow }
            }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.GetGoalsAsync();

        Assert.NotNull(result);
        Assert.Single(result!);
        Assert.Equal("DAILY_TIME", result[0].GoalType);
        Assert.Equal(120, result[0].TargetValue);
        Assert.Equal(60,  result[0].CurrentValue);
    }

    [Fact]
    public async Task GetGoalsAsync_WhenUnauthenticated_ReturnsNull()
    {
        var result = await BuildClient(EmptyDb(), new FakeHttpHandler()).GetGoalsAsync();
        Assert.Null(result);
    }

    [Fact]
    public async Task GetGoalsAsync_WhenServerError_ReturnsNull()
    {
        var result = await BuildClient(AuthenticatedDb(),
            new FakeHttpHandler(HttpStatusCode.InternalServerError, "")).GetGoalsAsync();
        Assert.Null(result);
    }

    // ---------- SetGoalAsync ----------

    [Fact]
    public async Task SetGoalAsync_WhenSuccess_ReturnsGoal()
    {
        var db = AuthenticatedDb();
        var payload = new
        {
            goal = new { id = "g-1", goalType = "DAILY_TIME", targetValue = 120,
                         currentValue = 0, active = true, startDate = DateTime.UtcNow }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.SetGoalAsync("DAILY_TIME", 120);

        Assert.NotNull(result);
        Assert.Equal("DAILY_TIME", result!.GoalType);
        Assert.Equal(120, result.TargetValue);
    }

    [Fact]
    public async Task SetGoalAsync_WhenUnauthenticated_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildClient(EmptyDb(), new FakeHttpHandler()).SetGoalAsync("DAILY_TIME", 120));
    }

    [Fact]
    public async Task SetGoalAsync_WhenUnauthorized_RaisesSessionExpiredAndThrows()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.Unauthorized, "");
        var client = BuildClient(db, handler);
        var fired = false;
        client.SessionExpired += (_, _) => fired = true;

        await Assert.ThrowsAsync<UnauthorizedAccessException>(
            () => client.SetGoalAsync("DAILY_TIME", 120));
        Assert.True(fired);
    }

    // ---------- GetProjectsAsync ----------

    [Fact]
    public async Task GetProjectsAsync_WhenSuccess_ReturnsProjects()
    {
        var db = AuthenticatedDb();
        // Projects API returns a direct array
        var payload = new[]
        {
            new { id = "p-1", name = "Work", color = "#3b82f6",
                  _count = new { sessions = 5 } },
            new { id = "p-2", name = "Personal", color = "#10b981",
                  _count = new { sessions = 2 } },
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.GetProjectsAsync();

        Assert.NotNull(result);
        Assert.Equal(2, result!.Count);
        Assert.Equal("Work", result[0].Name);
        Assert.Equal(5, result[0].SessionCount);
    }

    [Fact]
    public async Task GetProjectsAsync_WhenUnauthenticated_ReturnsNull()
    {
        var result = await BuildClient(EmptyDb(), new FakeHttpHandler()).GetProjectsAsync();
        Assert.Null(result);
    }

    // ---------- CreateProjectAsync ----------

    [Fact]
    public async Task CreateProjectAsync_WhenSuccess_ReturnsProject()
    {
        var db = AuthenticatedDb();
        var payload = new { id = "p-1", name = "Deep Work", color = "#3b82f6" };
        var handler = new FakeHttpHandler(HttpStatusCode.Created, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.CreateProjectAsync("Deep Work");

        Assert.NotNull(result);
        Assert.Equal("Deep Work", result!.Name);
    }

    [Fact]
    public async Task CreateProjectAsync_WhenDuplicateName_ThrowsInvalidOperation()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.Conflict,
            Json(new { error = "Project with this name already exists" }));
        var client = BuildClient(db, handler);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.CreateProjectAsync("Work"));
        Assert.Contains("already exists", ex.Message);
    }

    [Fact]
    public async Task CreateProjectAsync_WhenUnauthenticated_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildClient(EmptyDb(), new FakeHttpHandler()).CreateProjectAsync("Test"));
    }

    // ---------- UpdatePreferencesAsync ----------

    [Fact]
    public async Task UpdatePreferencesAsync_WhenSuccess_ReturnsUpdatedPreferences()
    {
        var db = AuthenticatedDb();
        var prefs = new { id = "p-1", userId = "u-1", preferredDuration = 45,
                          workStyle = "focused", breakReminders = true, soundEnabled = false };
        var handler = new FakeHttpHandler(HttpStatusCode.OK,
            Json(new { message = "updated", preferences = prefs }));
        var client = BuildClient(db, handler);

        var update = new Services.PreferencesUpdate
        {
            PreferredDuration = 45,
            WorkStyle         = "focused",
            BreakReminders    = true,
            SoundEnabled      = false,
        };
        var result = await client.UpdatePreferencesAsync(update);

        Assert.NotNull(result);
        Assert.Equal(45, result!.PreferredDuration);
        Assert.Equal("focused", result.WorkStyle);
    }

    [Fact]
    public async Task UpdatePreferencesAsync_WhenUnauthenticated_ReturnsNull()
    {
        var result = await BuildClient(EmptyDb(), new FakeHttpHandler())
            .UpdatePreferencesAsync(new Services.PreferencesUpdate { PreferredDuration = 25 });
        Assert.Null(result);
    }

    [Fact]
    public async Task UpdatePreferencesAsync_WhenServerError_ReturnsNull()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.InternalServerError, "");
        var client = BuildClient(db, handler);

        var result = await client.UpdatePreferencesAsync(new Services.PreferencesUpdate());
        Assert.Null(result);
    }

    // ---------- GetAnalyticsAsync ----------

    [Fact]
    public async Task GetAnalyticsAsync_WhenSuccess_ReturnsSummary()
    {
        var db = AuthenticatedDb();
        var payload = new
        {
            period = "week",
            dailyStats = new[]
            {
                new { date = "2026-03-10", sessionsCount = 3, completedCount = 2,
                      totalMinutes = 75, productivityScore = 85 }
            },
            summary = new
            {
                totalSessions = 3, completedSessions = 2,
                totalFocusMinutes = 75, averageProductivityScore = 85, completionRate = 66
            },
            peakTimes = new { peakHour = 10, peakPeriod = "morning" }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.GetAnalyticsAsync("week");

        Assert.NotNull(result);
        Assert.Equal("week", result!.Period);
        Assert.Equal(75, result.Summary.TotalFocusMinutes);
        Assert.Equal(66, result.Summary.CompletionRate);
        Assert.Equal("morning", result.PeakTimes?.PeakPeriod);
        Assert.Single(result.DailyStats);
    }

    [Fact]
    public async Task GetAnalyticsAsync_WhenUnauthenticated_ReturnsNull()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        var result = await client.GetAnalyticsAsync("week");

        Assert.Null(result);
    }

    [Fact]
    public async Task GetAnalyticsAsync_WhenServerError_ReturnsNull()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.InternalServerError, "error");
        var client = BuildClient(db, handler);

        var result = await client.GetAnalyticsAsync("week");

        Assert.Null(result);
    }

    [Fact]
    public async Task GetAnalyticsAsync_PassesPeriodQueryParam()
    {
        var db = AuthenticatedDb();
        var payload = new
        {
            period = "month",
            dailyStats = Array.Empty<object>(),
            summary = new { totalSessions = 0, completedSessions = 0,
                            totalFocusMinutes = 0, averageProductivityScore = 0, completionRate = 0 },
            peakTimes = (object?)null
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.GetAnalyticsAsync("month");

        Assert.NotNull(result);
        Assert.Equal("month", result!.Period);
        // Verify the URL contained the period param
        Assert.Contains("month", handler.LastRequestUri ?? "");
    }

    // ---------- GetSessionHistoryAsync ----------

    [Fact]
    public async Task GetSessionHistoryAsync_WhenSuccess_ReturnsSessions()
    {
        var db = AuthenticatedDb();
        var now = DateTime.UtcNow;
        var sessions = new[]
        {
            new { id = "s-1", plannedDuration = 25, startTime = now.AddHours(-1),
                  endTime = (DateTime?)null, completed = true, isPaused = false },
            new { id = "s-2", plannedDuration = 45, startTime = now.AddHours(-3),
                  endTime = (DateTime?)null, completed = false, isPaused = false },
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(new { sessions }));
        var client = BuildClient(db, handler);

        var result = await client.GetSessionHistoryAsync(10);

        Assert.NotNull(result);
        Assert.Equal(2, result!.Count);
        Assert.Equal("s-1", result[0].Id);
    }

    [Fact]
    public async Task GetSessionHistoryAsync_WhenUnauthenticated_ReturnsNull()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        var result = await client.GetSessionHistoryAsync();

        Assert.Null(result);
    }

    [Fact]
    public async Task GetSessionHistoryAsync_WhenServerError_ReturnsNull()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.InternalServerError, "");
        var client = BuildClient(db, handler);

        var result = await client.GetSessionHistoryAsync();

        Assert.Null(result);
    }

    // ---------- TogglePauseAsync ----------

    [Fact]
    public async Task TogglePauseAsync_WhenPause_ReturnsUpdatedSession()
    {
        var db = AuthenticatedDb();
        var session = new { id = "s-1", plannedDuration = 25, startTime = DateTime.UtcNow,
                            completed = false, isPaused = true, pausedAt = DateTime.UtcNow };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(new { session }));
        var client = BuildClient(db, handler);

        var result = await client.TogglePauseAsync("s-1", "pause");

        Assert.NotNull(result);
        Assert.True(result!.IsPaused);
    }

    [Fact]
    public async Task TogglePauseAsync_WhenResume_ReturnsUpdatedSessionWithNewStartTime()
    {
        var db = AuthenticatedDb();
        var newStart = DateTime.UtcNow.AddMinutes(-3); // server shifted start forward
        var session = new { id = "s-1", plannedDuration = 25, startTime = newStart,
                            completed = false, isPaused = false };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(new { session }));
        var client = BuildClient(db, handler);

        var result = await client.TogglePauseAsync("s-1", "resume");

        Assert.NotNull(result);
        Assert.False(result!.IsPaused);
    }

    [Fact]
    public async Task TogglePauseAsync_WhenUnauthenticated_Throws()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.TogglePauseAsync("s-1", "pause"));
    }

    [Fact]
    public async Task TogglePauseAsync_WhenUnauthorized_RaisesSessionExpiredAndThrows()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.Unauthorized, "");
        var client = BuildClient(db, handler);

        var eventFired = false;
        client.SessionExpired += (_, _) => eventFired = true;

        await Assert.ThrowsAsync<UnauthorizedAccessException>(
            () => client.TogglePauseAsync("s-1", "pause"));
        Assert.True(eventFired);
    }

    [Fact]
    public async Task TogglePauseAsync_WhenServerError_Throws()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.InternalServerError, "error");
        var client = BuildClient(db, handler);

        await Assert.ThrowsAsync<HttpRequestException>(
            () => client.TogglePauseAsync("s-1", "pause"));
    }

    // ---------- GetLeaderboardAsync ----------

    [Fact]
    public async Task GetLeaderboardAsync_WhenSuccess_ReturnsLeaderboard()
    {
        var db = AuthenticatedDb();
        var payload = new
        {
            period = "week",
            userRank = 3,
            leaderboard = new[]
            {
                new { rank = 1, userId = "u-1", userName = "Alice", totalMinutes = 480,
                      sessionsCount = 10, streak = 5, isCurrentUser = false },
                new { rank = 2, userId = "u-2", userName = "Bob",   totalMinutes = 360,
                      sessionsCount = 8,  streak = 3, isCurrentUser = false },
                new { rank = 3, userId = "u-3", userName = "Me",    totalMinutes = 240,
                      sessionsCount = 6,  streak = 2, isCurrentUser = true  },
            }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.GetLeaderboardAsync("week");

        Assert.NotNull(result);
        Assert.Equal("week", result!.Period);
        Assert.Equal(3,      result.UserRank);
        Assert.Equal(3,      result.Leaderboard.Count);
        Assert.Equal("Alice", result.Leaderboard[0].UserName);
        Assert.True(result.Leaderboard[2].IsCurrentUser);
        Assert.Equal(480,    result.Leaderboard[0].TotalMinutes);
    }

    [Fact]
    public async Task GetLeaderboardAsync_WhenUnauthenticated_ReturnsNull()
    {
        var result = await BuildClient(EmptyDb(), new FakeHttpHandler()).GetLeaderboardAsync();
        Assert.Null(result);
    }

    [Fact]
    public async Task GetLeaderboardAsync_WhenServerError_ReturnsNull()
    {
        var result = await BuildClient(AuthenticatedDb(),
            new FakeHttpHandler(HttpStatusCode.InternalServerError, "")).GetLeaderboardAsync();
        Assert.Null(result);
    }

    [Fact]
    public async Task GetLeaderboardAsync_PassesPeriodQueryParam()
    {
        var db = AuthenticatedDb();
        var payload = new { period = "month", userRank = 1, leaderboard = Array.Empty<object>() };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        await client.GetLeaderboardAsync("month");

        Assert.Contains("month", handler.LastRequestUri ?? "");
    }

    // ---------- GetCoachAdviceStreamAsync ----------

    [Fact]
    public async Task GetCoachAdviceStreamAsync_WhenUnauthenticated_Throws()
    {
        var client = BuildClient(EmptyDb(), new FakeHttpHandler());

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.GetCoachAdviceStreamAsync("How am I doing?", null, _ => { }));
    }

    [Fact]
    public async Task GetCoachAdviceStreamAsync_WhenSuccess_InvokesCallbackWithText()
    {
        var db = AuthenticatedDb();
        // Simulate SSE stream in Anthropic delta format
        var sseBody =
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hello \"}}\n\n" +
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"world\"}}\n\n" +
            "data: [DONE]\n\n";
        var handler = new FakeHttpHandler(HttpStatusCode.OK, sseBody, "text/event-stream");
        var client = BuildClient(db, handler);

        var chunks = new System.Collections.Generic.List<string>();
        await client.GetCoachAdviceStreamAsync("How am I doing?", null, t => chunks.Add(t));

        Assert.Equal(2, chunks.Count);
        Assert.Equal("Hello ", chunks[0]);
        Assert.Equal("world",  chunks[1]);
    }

    [Fact]
    public async Task GetCoachAdviceStreamAsync_SimpleTextFormat_InvokesCallback()
    {
        var db = AuthenticatedDb();
        // Simulate SSE stream in simple text format
        var sseBody =
            "data: {\"text\":\"Great job!\"}\n\n" +
            "data: [DONE]\n\n";
        var handler = new FakeHttpHandler(HttpStatusCode.OK, sseBody, "text/event-stream");
        var client = BuildClient(db, handler);

        var chunks = new System.Collections.Generic.List<string>();
        await client.GetCoachAdviceStreamAsync("Give me feedback", null, t => chunks.Add(t));

        Assert.Single(chunks);
        Assert.Equal("Great job!", chunks[0]);
    }

    // ---------- GetSessionHistoryAsync (Sprint 19 — extended coverage) ----------

    [Fact]
    public async Task GetSessionHistoryAsync_ReturnsCompletedAndStoppedSessions()
    {
        var db = AuthenticatedDb();
        var now = DateTime.UtcNow;
        var payload = new
        {
            sessions = new[]
            {
                new { id = "s-1", plannedDuration = 25, startTime = now.AddHours(-2),
                      endTime = (DateTime?)now.AddHours(-1).AddMinutes(-35),
                      completed = true,  isPaused = false, sessionType = "WORK" },
                new { id = "s-2", plannedDuration = 45, startTime = now.AddHours(-5),
                      endTime = (DateTime?)now.AddHours(-4),
                      completed = false, isPaused = false, sessionType = "STUDY" },
                new { id = "s-3", plannedDuration = 25, startTime = now.AddHours(-1),
                      endTime = (DateTime?)null,
                      completed = false, isPaused = true,  sessionType = "CREATIVE" },
            }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.GetSessionHistoryAsync(30);

        Assert.NotNull(result);
        Assert.Equal(3, result!.Count);
        Assert.True(result[0].Completed);
        Assert.Equal("STUDY",    result[1].SessionType);
        Assert.True(result[2].IsPaused);
        Assert.Null(result[2].EndTime);
    }

    [Fact]
    public async Task GetSessionHistoryAsync_PassesLimitQueryParam()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.OK,
            Json(new { sessions = Array.Empty<object>() }));
        var client = BuildClient(db, handler);

        await client.GetSessionHistoryAsync(limit: 20);

        Assert.Contains("20", handler.LastRequestUri ?? "");
    }

    // ---------- GetTeamsAsync ----------

    [Fact]
    public async Task GetTeamsAsync_WhenSuccess_ReturnsTeams()
    {
        var db = AuthenticatedDb();
        var payload = new
        {
            teams = new[]
            {
                new { id = "t-1", name = "Alpha Squad", ownerId = "u-1", inviteCode = "ABC123",
                      myRole = "OWNER", memberCount = 3, joinedAt = DateTime.UtcNow },
                new { id = "t-2", name = "Beta Team",  ownerId = "u-9", inviteCode = "XYZ789",
                      myRole = "MEMBER", memberCount = 5, joinedAt = DateTime.UtcNow },
            }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.OK, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.GetTeamsAsync();

        Assert.NotNull(result);
        Assert.Equal(2, result!.Count);
        Assert.Equal("Alpha Squad", result[0].Name);
        Assert.Equal("OWNER",       result[0].MyRole);
        Assert.Equal("ABC123",      result[0].InviteCode);
        Assert.Equal(3,             result[0].MemberCount);
        Assert.Equal("MEMBER",      result[1].MyRole);
    }

    [Fact]
    public async Task GetTeamsAsync_WhenUnauthenticated_ReturnsNull()
    {
        var result = await BuildClient(EmptyDb(), new FakeHttpHandler()).GetTeamsAsync();
        Assert.Null(result);
    }

    [Fact]
    public async Task GetTeamsAsync_WhenServerError_ReturnsNull()
    {
        var result = await BuildClient(AuthenticatedDb(),
            new FakeHttpHandler(HttpStatusCode.InternalServerError, "")).GetTeamsAsync();
        Assert.Null(result);
    }

    // ---------- CreateTeamAsync ----------

    [Fact]
    public async Task CreateTeamAsync_WhenSuccess_ReturnsTeam()
    {
        var db = AuthenticatedDb();
        var payload = new
        {
            team = new { id = "t-1", name = "My Team", ownerId = "u-1",
                         inviteCode = "CODE01", myRole = "OWNER", memberCount = 1 }
        };
        var handler = new FakeHttpHandler(HttpStatusCode.Created, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.CreateTeamAsync("My Team");

        Assert.NotNull(result);
        Assert.Equal("My Team", result!.Name);
        Assert.Equal("OWNER",   result.MyRole);
        Assert.Equal("CODE01",  result.InviteCode);
    }

    [Fact]
    public async Task CreateTeamAsync_WhenUnauthenticated_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildClient(EmptyDb(), new FakeHttpHandler()).CreateTeamAsync("Test"));
    }

    [Fact]
    public async Task CreateTeamAsync_WhenUnauthorized_RaisesSessionExpiredAndThrows()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.Unauthorized, "");
        var client = BuildClient(db, handler);
        var fired = false;
        client.SessionExpired += (_, _) => fired = true;

        await Assert.ThrowsAsync<UnauthorizedAccessException>(
            () => client.CreateTeamAsync("Test"));
        Assert.True(fired);
    }

    // ---------- JoinTeamAsync ----------

    [Fact]
    public async Task JoinTeamAsync_WhenSuccess_ReturnsTeam()
    {
        var db = AuthenticatedDb();
        var payload = new
        {
            team    = new { id = "t-5", name = "Champions" },
            message = "Joined team \"Champions\""
        };
        var handler = new FakeHttpHandler(HttpStatusCode.Created, Json(payload));
        var client = BuildClient(db, handler);

        var result = await client.JoinTeamAsync("INVITE99");

        Assert.NotNull(result);
        Assert.Equal("Champions", result!.Name);
    }

    [Fact]
    public async Task JoinTeamAsync_WhenInvalidCode_ThrowsInvalidOperation()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.NotFound,
            Json(new { error = "Invalid invite code" }));
        var client = BuildClient(db, handler);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.JoinTeamAsync("BADCODE"));
        Assert.Contains("Invalid invite code", ex.Message);
    }

    [Fact]
    public async Task JoinTeamAsync_WhenAlreadyMember_ThrowsInvalidOperation()
    {
        var db = AuthenticatedDb();
        var handler = new FakeHttpHandler(HttpStatusCode.Conflict,
            Json(new { error = "Already a member of this team" }));
        var client = BuildClient(db, handler);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.JoinTeamAsync("CODE01"));
        Assert.Contains("Already a member", ex.Message);
    }

    [Fact]
    public async Task JoinTeamAsync_WhenUnauthenticated_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildClient(EmptyDb(), new FakeHttpHandler()).JoinTeamAsync("CODE"));
    }

    // ---------- Logout ----------

    [Fact]
    public void Logout_ClearsTokenAndRaisesEvent()
    {
        var db = AuthenticatedDb();
        var client = BuildClient(db, new FakeHttpHandler());

        var eventFired = false;
        client.SessionExpired += (_, _) => eventFired = true;

        client.Logout();

        Assert.False(client.IsAuthenticated());
        Assert.True(eventFired);
        db.Verify(d => d.SaveSetting("AuthToken", string.Empty), Times.Once);
    }
}

// ---------- FakeHttpHandler ----------

/// <summary>
/// Simple synchronous HTTP message handler for testing.
/// Returns a pre-configured response or throws a pre-configured exception.
/// </summary>
internal class FakeHttpHandler : HttpMessageHandler
{
    private readonly HttpStatusCode _status;
    private readonly string _body;
    private readonly string _contentType;
    private readonly Exception? _exception;
    public int CallCount { get; private set; }
    public string? LastRequestUri { get; private set; }

    public FakeHttpHandler(HttpStatusCode status = HttpStatusCode.OK, string body = "",
        string contentType = "application/json")
    {
        _status      = status;
        _body        = body;
        _contentType = contentType;
    }

    public FakeHttpHandler(Exception exception)
    {
        _status      = HttpStatusCode.OK;
        _body        = "";
        _contentType = "application/json";
        _exception   = exception;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        CallCount++;
        LastRequestUri = request.RequestUri?.ToString();
        if (_exception != null) throw _exception;

        return Task.FromResult(new HttpResponseMessage(_status)
        {
            Content = new StringContent(_body, Encoding.UTF8, _contentType)
        });
    }
}
