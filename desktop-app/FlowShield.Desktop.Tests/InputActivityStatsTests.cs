using FlowShield.Desktop.Services;
using Xunit;

namespace FlowShield.Desktop.Tests;

public class InputActivityStatsTests
{
    [Fact]
    public void GetActivityLevel_NoInput_Returns10()
    {
        var stats = new InputActivityStats { KeystrokeCount = 0, MouseClickCount = 0 };
        Assert.Equal(10, stats.GetActivityLevel());
    }

    [Fact]
    public void GetActivityLevel_MinimalInput_Returns20()
    {
        // totalInput = 11 + 0*2 = 11 > 10
        var stats = new InputActivityStats { KeystrokeCount = 11, MouseClickCount = 0 };
        Assert.Equal(20, stats.GetActivityLevel());
    }

    [Fact]
    public void GetActivityLevel_ModerateInput_Returns40()
    {
        // totalInput = 51 > 50
        var stats = new InputActivityStats { KeystrokeCount = 51, MouseClickCount = 0 };
        Assert.Equal(40, stats.GetActivityLevel());
    }

    [Fact]
    public void GetActivityLevel_HighInput_Returns60()
    {
        // totalInput = 151 > 150
        var stats = new InputActivityStats { KeystrokeCount = 151, MouseClickCount = 0 };
        Assert.Equal(60, stats.GetActivityLevel());
    }

    [Fact]
    public void GetActivityLevel_VeryHighInput_Returns80()
    {
        // totalInput = 301 > 300
        var stats = new InputActivityStats { KeystrokeCount = 301, MouseClickCount = 0 };
        Assert.Equal(80, stats.GetActivityLevel());
    }

    [Fact]
    public void GetActivityLevel_ExtremeInput_Returns100()
    {
        // totalInput = 501 > 500
        var stats = new InputActivityStats { KeystrokeCount = 501, MouseClickCount = 0 };
        Assert.Equal(100, stats.GetActivityLevel());
    }

    [Fact]
    public void GetActivityLevel_MouseClicksWeightedDouble()
    {
        // totalInput = 0 + 26*2 = 52 > 50 → 40
        var stats = new InputActivityStats { KeystrokeCount = 0, MouseClickCount = 26 };
        Assert.Equal(40, stats.GetActivityLevel());
    }

    [Fact]
    public void GetActivityLevel_CombinedInputs()
    {
        // totalInput = 100 + 30*2 = 160 > 150 → 60
        var stats = new InputActivityStats { KeystrokeCount = 100, MouseClickCount = 30 };
        Assert.Equal(60, stats.GetActivityLevel());
    }
}
