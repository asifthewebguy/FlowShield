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
    private readonly Exception? _exception;
    public int CallCount { get; private set; }
    public string? LastRequestUri { get; private set; }

    public FakeHttpHandler(HttpStatusCode status = HttpStatusCode.OK, string body = "")
    {
        _status = status;
        _body   = body;
    }

    public FakeHttpHandler(Exception exception)
    {
        _status    = HttpStatusCode.OK;
        _body      = "";
        _exception = exception;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        CallCount++;
        LastRequestUri = request.RequestUri?.ToString();
        if (_exception != null) throw _exception;

        return Task.FromResult(new HttpResponseMessage(_status)
        {
            Content = new StringContent(_body, Encoding.UTF8, "application/json")
        });
    }
}
