using System;
using System.Threading;
using System.Threading.Tasks;
using FlowShield.Desktop.Interfaces;
using FlowShield.Desktop.Services;
using Moq;
using Xunit;

namespace FlowShield.Desktop.Tests;

/// <summary>
/// SessionManager must run on an STA thread because it creates a DispatcherTimer (WPF).
/// Use RunOnSTA() for all tests that exercise StartSessionAsync / StopSessionAsync.
/// </summary>
public class SessionManagerTests
{
    // ---------- helpers ----------

    private static (SessionManager sm, Mock<IApiClient> api, Mock<IActivityTracker> tracker,
        Mock<INotificationService> notify, Mock<IWebsiteBlocker> web, Mock<IApplicationBlocker> app)
        Build()
    {
        var api     = new Mock<IApiClient>();
        var tracker = new Mock<IActivityTracker>();
        var notify  = new Mock<INotificationService>();
        var web     = new Mock<IWebsiteBlocker>();
        var appB    = new Mock<IApplicationBlocker>();

        var sm = new SessionManager(api.Object, tracker.Object, notify.Object, web.Object, appB.Object);
        return (sm, api, tracker, notify, web, appB);
    }

    private static SessionInfo MakeSession(int durationMinutes = 25) => new SessionInfo
    {
        Id            = "sess-1",
        PlannedDuration = durationMinutes,
        StartTime     = DateTime.UtcNow,
        Completed     = false,
    };

    /// <summary>Runs an async test body on an STA thread (required for DispatcherTimer).</summary>
    private static void RunOnSTA(Func<Task> body)
    {
        Exception? caught = null;
        var thread = new Thread(() =>
        {
            try { body().GetAwaiter().GetResult(); }
            catch (Exception ex) { caught = ex; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join(TimeSpan.FromSeconds(10));
        if (caught != null) throw caught;
    }

    // ---------- initial state ----------

    [Fact]
    public void IsRunning_Initially_ReturnsFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, _, _, _, _, _) = Build();
            Assert.False(sm.IsRunning);
            await Task.CompletedTask;
        });
    }

    [Fact]
    public void CurrentSession_Initially_IsNull()
    {
        RunOnSTA(async () =>
        {
            var (sm, _, _, _, _, _) = Build();
            Assert.Null(sm.CurrentSession);
            await Task.CompletedTask;
        });
    }

    [Fact]
    public void BlockingEnabled_Initially_IsFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, _, _, _, _, _) = Build();
            Assert.False(sm.BlockingEnabled);
            await Task.CompletedTask;
        });
    }

    // ---------- StartSessionAsync ----------

    [Fact]
    public void StartSessionAsync_WhenApiSucceeds_ReturnsTrue()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());

            var result = await sm.StartSessionAsync(25);

            Assert.True(result);
        });
    }

    [Fact]
    public void StartSessionAsync_WhenApiSucceeds_SetsIsRunningTrue()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());

            await sm.StartSessionAsync(25);

            Assert.True(sm.IsRunning);
        });
    }

    [Fact]
    public void StartSessionAsync_WhenApiSucceeds_SetsCurrentSession()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            var session = MakeSession();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(session);

            await sm.StartSessionAsync(25);

            Assert.NotNull(sm.CurrentSession);
            Assert.Equal("sess-1", sm.CurrentSession!.Id);
        });
    }

    [Fact]
    public void StartSessionAsync_WhenApiSucceeds_StartsActivityTracking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, tracker, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());

            await sm.StartSessionAsync(25);

            tracker.Verify(t => t.Start(), Times.Once);
        });
    }

    [Fact]
    public void StartSessionAsync_WhenApiReturnsNull_ReturnsFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync((SessionInfo?)null);

            var result = await sm.StartSessionAsync(25);

            Assert.False(result);
            Assert.False(sm.IsRunning);
        });
    }

    [Fact]
    public void StartSessionAsync_WhenApiThrows_ReturnsFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(It.IsAny<int>(), It.IsAny<string>(), It.IsAny<string?>()))
               .ThrowsAsync(new Exception("network error"));

            var result = await sm.StartSessionAsync(25);

            Assert.False(result);
            Assert.False(sm.IsRunning);
        });
    }

    [Fact]
    public void StartSessionAsync_WithBlockingEnabled_EngagesBlocking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, web, appB) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            sm.BlockingEnabled = true;

            await sm.StartSessionAsync(25);

            web.Verify(w => w.EnableBlocking(), Times.Once);
            appB.Verify(a => a.BlockApps(), Times.Once);
        });
    }

    [Fact]
    public void StartSessionAsync_WithBlockingDisabled_DoesNotEngageBlocking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, web, appB) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            // BlockingEnabled is false by default

            await sm.StartSessionAsync(25);

            web.Verify(w => w.EnableBlocking(), Times.Never);
            appB.Verify(a => a.BlockApps(), Times.Never);
        });
    }

    [Fact]
    public void StartSessionAsync_FiresSessionStartedEvent()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            var session = MakeSession();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(session);

            SessionInfo? fired = null;
            sm.SessionStarted += (_, s) => fired = s;

            await sm.StartSessionAsync(25);

            Assert.NotNull(fired);
            Assert.Equal("sess-1", fired!.Id);
        });
    }

    // ---------- StopSessionAsync ----------

    [Fact]
    public void StopSessionAsync_SetsIsRunningFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.EndSessionAsync(It.IsAny<string>())).ReturnsAsync(true);

            await sm.StartSessionAsync(25);
            await sm.StopSessionAsync();

            Assert.False(sm.IsRunning);
        });
    }

    [Fact]
    public void StopSessionAsync_ClearsCurrentSession()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.EndSessionAsync(It.IsAny<string>())).ReturnsAsync(true);

            await sm.StartSessionAsync(25);
            await sm.StopSessionAsync();

            Assert.Null(sm.CurrentSession);
        });
    }

    [Fact]
    public void StopSessionAsync_WhenSessionExists_CallsEndSessionAsync()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.EndSessionAsync("sess-1")).ReturnsAsync(true);

            await sm.StartSessionAsync(25);
            await sm.StopSessionAsync();

            api.Verify(a => a.EndSessionAsync("sess-1"), Times.Once);
        });
    }

    [Fact]
    public void StopSessionAsync_StopsActivityTracking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, tracker, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.EndSessionAsync(It.IsAny<string>())).ReturnsAsync(true);

            await sm.StartSessionAsync(25);
            await sm.StopSessionAsync();

            tracker.Verify(t => t.Stop(), Times.Once);
        });
    }

    [Fact]
    public void StopSessionAsync_DisengagesBlocking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, web, appB) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.EndSessionAsync(It.IsAny<string>())).ReturnsAsync(true);
            sm.BlockingEnabled = true;

            await sm.StartSessionAsync(25);
            await sm.StopSessionAsync();

            web.Verify(w => w.DisableBlocking(), Times.Once);
            appB.Verify(a => a.UnblockApps(), Times.Once);
        });
    }

    [Fact]
    public void StopSessionAsync_FiresSessionEndedEvent()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.EndSessionAsync(It.IsAny<string>())).ReturnsAsync(true);

            var fired = false;
            sm.SessionEnded += (_, _) => fired = true;

            await sm.StartSessionAsync(25);
            await sm.StopSessionAsync();

            Assert.True(fired);
        });
    }

    // ---------- BlockingEnabled property ----------

    [Fact]
    public void BlockingEnabled_SetTrueWhileRunning_EngagesBlocking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, web, appB) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());

            await sm.StartSessionAsync(25);
            sm.BlockingEnabled = true;

            web.Verify(w => w.EnableBlocking(), Times.Once);
            appB.Verify(a => a.BlockApps(), Times.Once);
        });
    }

    [Fact]
    public void BlockingEnabled_SetFalseWhileRunning_DisengagesBlocking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, web, appB) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            sm.BlockingEnabled = true;

            await sm.StartSessionAsync(25);
            sm.BlockingEnabled = false;

            web.Verify(w => w.DisableBlocking(), Times.AtLeastOnce);
            appB.Verify(a => a.UnblockApps(), Times.AtLeastOnce);
        });
    }

    [Fact]
    public void BlockingEnabled_SetTrueWhileNotRunning_DoesNotEngageBlocking()
    {
        RunOnSTA(async () =>
        {
            var (sm, _, _, _, web, appB) = Build();
            sm.BlockingEnabled = true; // no active session

            web.Verify(w => w.EnableBlocking(), Times.Never);
            appB.Verify(a => a.BlockApps(), Times.Never);
            await Task.CompletedTask;
        });
    }

    // ---------- InitializeAsync ----------

    [Fact]
    public void InitializeAsync_WhenActiveSessionExists_SetsIsRunningTrue()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            var session = new SessionInfo
            {
                Id = "existing-sess",
                PlannedDuration = 25,
                StartTime = DateTime.UtcNow.AddMinutes(-5), // started 5 minutes ago
                Completed = false,
            };
            api.Setup(a => a.GetActiveSessionAsync()).ReturnsAsync(session);

            await sm.InitializeAsync();

            Assert.True(sm.IsRunning);
            Assert.Equal("existing-sess", sm.CurrentSession!.Id);
        });
    }

    [Fact]
    public void InitializeAsync_WhenNoActiveSession_DoesNotSetIsRunning()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.GetActiveSessionAsync()).ReturnsAsync((SessionInfo?)null);

            await sm.InitializeAsync();

            Assert.False(sm.IsRunning);
            Assert.Null(sm.CurrentSession);
        });
    }

    [Fact]
    public void InitializeAsync_WhenSessionIsPaused_RestoresPausedState()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, tracker, _, _, _) = Build();
            var session = new SessionInfo
            {
                Id = "paused-sess",
                PlannedDuration = 25,
                StartTime = DateTime.UtcNow.AddMinutes(-5),
                Completed = false,
                IsPaused = true,
            };
            api.Setup(a => a.GetActiveSessionAsync()).ReturnsAsync(session);

            await sm.InitializeAsync();

            Assert.True(sm.IsRunning);
            Assert.True(sm.IsPaused);
            // Timer should NOT start for paused sessions
            tracker.Verify(t => t.Start(), Times.Never);
        });
    }

    // ---------- PauseSessionAsync ----------

    [Fact]
    public void PauseSessionAsync_WhenRunning_ReturnsTrueAndSetsPaused()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());

            await sm.StartSessionAsync(25);
            var result = await sm.PauseSessionAsync();

            Assert.True(result);
            Assert.True(sm.IsPaused);
        });
    }

    [Fact]
    public void PauseSessionAsync_WhenRunning_StopsActivityTracking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, tracker, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();

            tracker.Verify(t => t.Stop(), Times.Once);
        });
    }

    [Fact]
    public void PauseSessionAsync_WhenRunning_FiresSessionPausedEvent()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());

            var fired = false;
            sm.SessionPaused += (_, _) => fired = true;

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();

            Assert.True(fired);
        });
    }

    [Fact]
    public void PauseSessionAsync_WhenNotRunning_ReturnsFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, _, _, _, _, _) = Build();

            var result = await sm.PauseSessionAsync();

            Assert.False(result);
            Assert.False(sm.IsPaused);
        });
    }

    [Fact]
    public void PauseSessionAsync_WhenAlreadyPaused_ReturnsFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();
            var secondPause = await sm.PauseSessionAsync();

            Assert.False(secondPause);
        });
    }

    [Fact]
    public void PauseSessionAsync_WithBlockingEnabled_DisengagesBlocking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, web, appB) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());
            sm.BlockingEnabled = true;

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();

            web.Verify(w => w.DisableBlocking(), Times.AtLeastOnce);
            appB.Verify(a => a.UnblockApps(), Times.AtLeastOnce);
        });
    }

    // ---------- ResumeSessionAsync ----------

    [Fact]
    public void ResumeSessionAsync_WhenPaused_ReturnsTrueAndClearsPaused()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            var resumedSession = new SessionInfo
            {
                Id = "sess-1", PlannedDuration = 25,
                StartTime = DateTime.UtcNow.AddMinutes(-3), Completed = false, IsPaused = false,
            };
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "resume")).ReturnsAsync(resumedSession);

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();
            var result = await sm.ResumeSessionAsync();

            Assert.True(result);
            Assert.False(sm.IsPaused);
        });
    }

    [Fact]
    public void ResumeSessionAsync_WhenPaused_RestartsActivityTracking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, tracker, _, _, _) = Build();
            var resumedSession = new SessionInfo
            {
                Id = "sess-1", PlannedDuration = 25,
                StartTime = DateTime.UtcNow.AddMinutes(-3), Completed = false, IsPaused = false,
            };
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "resume")).ReturnsAsync(resumedSession);

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();
            await sm.ResumeSessionAsync();

            // Start called twice: once on StartSessionAsync, once on ResumeSessionAsync
            tracker.Verify(t => t.Start(), Times.Exactly(2));
        });
    }

    [Fact]
    public void ResumeSessionAsync_WhenPaused_FiresSessionResumedEvent()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            var resumedSession = new SessionInfo
            {
                Id = "sess-1", PlannedDuration = 25,
                StartTime = DateTime.UtcNow.AddMinutes(-3), Completed = false, IsPaused = false,
            };
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "resume")).ReturnsAsync(resumedSession);

            var fired = false;
            sm.SessionResumed += (_, _) => fired = true;

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();
            await sm.ResumeSessionAsync();

            Assert.True(fired);
        });
    }

    [Fact]
    public void ResumeSessionAsync_WhenNotPaused_ReturnsFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());

            await sm.StartSessionAsync(25);
            var result = await sm.ResumeSessionAsync();

            Assert.False(result);
        });
    }

    [Fact]
    public void ResumeSessionAsync_WhenNotRunning_ReturnsFalse()
    {
        RunOnSTA(async () =>
        {
            var (sm, _, _, _, _, _) = Build();

            var result = await sm.ResumeSessionAsync();

            Assert.False(result);
        });
    }

    [Fact]
    public void ResumeSessionAsync_WithBlockingEnabled_ReengagesBlocking()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, web, appB) = Build();
            var resumedSession = new SessionInfo
            {
                Id = "sess-1", PlannedDuration = 25,
                StartTime = DateTime.UtcNow.AddMinutes(-3), Completed = false, IsPaused = false,
            };
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "resume")).ReturnsAsync(resumedSession);
            sm.BlockingEnabled = true;

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();
            await sm.ResumeSessionAsync();

            web.Verify(w => w.EnableBlocking(), Times.Exactly(2)); // once on start, once on resume
            appB.Verify(a => a.BlockApps(), Times.Exactly(2));
        });
    }

    // ---------- Stop while paused ----------

    [Fact]
    public void StopSessionAsync_WhenPaused_ClearsPausedState()
    {
        RunOnSTA(async () =>
        {
            var (sm, api, _, _, _, _) = Build();
            api.Setup(a => a.StartSessionAsync(25, "WORK", null)).ReturnsAsync(MakeSession());
            api.Setup(a => a.TogglePauseAsync("sess-1", "pause")).ReturnsAsync(MakeSession());
            api.Setup(a => a.EndSessionAsync(It.IsAny<string>())).ReturnsAsync(true);

            await sm.StartSessionAsync(25);
            await sm.PauseSessionAsync();
            await sm.StopSessionAsync();

            Assert.False(sm.IsRunning);
            Assert.False(sm.IsPaused);
            Assert.Null(sm.CurrentSession);
        });
    }
}
