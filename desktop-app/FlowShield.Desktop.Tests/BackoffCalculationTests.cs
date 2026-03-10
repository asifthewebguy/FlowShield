using FlowShield.Desktop.Services;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class BackoffCalculationTests
{
    private static readonly TimeSpan Base = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan Max = TimeSpan.FromMinutes(30);

    [Fact]
    public void CalculateBackoffDelay_ZeroFailures_ReturnsBaseInterval()
    {
        var delay = SyncService.CalculateBackoffDelay(0, Base, Max);
        Assert.Equal(Base, delay);
    }

    [Fact]
    public void CalculateBackoffDelay_OneFailure_ReturnsBaseInterval()
    {
        // 2^(1-1) = 1 → base * 1 = 5min
        var delay = SyncService.CalculateBackoffDelay(1, Base, Max);
        Assert.Equal(Base, delay);
    }

    [Fact]
    public void CalculateBackoffDelay_TwoFailures_ReturnsDouble()
    {
        // 2^(2-1) = 2 → base * 2 = 10min
        var delay = SyncService.CalculateBackoffDelay(2, Base, Max);
        Assert.Equal(TimeSpan.FromMinutes(10), delay);
    }

    [Fact]
    public void CalculateBackoffDelay_ThreeFailures_ReturnsQuadruple()
    {
        // 2^(3-1) = 4 → base * 4 = 20min
        var delay = SyncService.CalculateBackoffDelay(3, Base, Max);
        Assert.Equal(TimeSpan.FromMinutes(20), delay);
    }

    [Fact]
    public void CalculateBackoffDelay_FourFailures_CapsAtMax()
    {
        // 2^(4-1) = 8 → base * 8 = 40min > max → capped at 30min
        var delay = SyncService.CalculateBackoffDelay(4, Base, Max);
        Assert.Equal(Max, delay);
    }

    [Fact]
    public void CalculateBackoffDelay_ManyFailures_AlwaysCapsAtMax()
    {
        var delay = SyncService.CalculateBackoffDelay(100, Base, Max);
        Assert.Equal(Max, delay);
    }

    [Fact]
    public void CalculateBackoffDelay_NegativeFailures_ReturnsBaseInterval()
    {
        var delay = SyncService.CalculateBackoffDelay(-5, Base, Max);
        Assert.Equal(Base, delay);
    }

    [Fact]
    public void CalculateBackoffDelay_CustomIntervals_ScalesCorrectly()
    {
        var baseInterval = TimeSpan.FromMinutes(1);
        var maxInterval = TimeSpan.FromMinutes(8);

        // 2^(3-1) = 4 → 1min * 4 = 4min
        var delay = SyncService.CalculateBackoffDelay(3, baseInterval, maxInterval);
        Assert.Equal(TimeSpan.FromMinutes(4), delay);
    }
}
