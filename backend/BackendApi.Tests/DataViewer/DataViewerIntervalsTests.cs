using BackendApi.Models.DataViewer;
using BackendApi.Repositories.DataViewer;

namespace BackendApi.Tests.DataViewer;

public sealed class DataViewerIntervalsTests
{
    [Fact]
    public void BuildsOneRawLithoRowPerIntervalFromNameValueRows()
    {
        var (intervals, hidden) = DataViewerIntervals.Build(
        [
            Record("LithoFacies", "SS"),
            Record("Colour", "GY"),
            Record("RedoxFacies", "OX"),
            Record("CA", "CA1"),
            Record("OM", "0"),
            Record("OX", "1"),
            Record("InternalStructure", "LAM"),
            Record("Granulo", "F"),
            Record("Hardness", "H2"),
            Record("LithologyComments", "Fine  sand")
        ]);

        var interval = Assert.Single(intervals);
        Assert.Equal(10m, interval.LithoFrom);
        Assert.Equal(12m, interval.LithoTo);
        Assert.Equal(0, hidden);
        Assert.Equal(
            new Dictionary<string, string?>
            {
                ["lithoCode"] = "SS",
                ["colorCode"] = "GY",
                ["redoxCode"] = "OX",
                ["ca"] = "CA1",
                ["om"] = "0",
                ["ox"] = "1",
                ["sedim"] = "LAM",
                ["granulo"] = "F",
                ["hardness"] = "H2",
                ["lithologyComments"] = "Fine  sand"     // unchanged, spaces kept
            },
            interval.Values);
    }

    [Fact]
    public void ReadsCommentsFromCommentValueWhenItHoldsTheText()
    {
        var (intervals, _) = DataViewerIntervals.Build(
        [
            Record("LithologyComments", null, commentValue: "Clay lens"),
            Record("LithologyComments", "Plain value", from: 12m, to: 14m)
        ]);

        Assert.Equal("Clay lens", intervals[0].Values["lithologyComments"]);
        Assert.Equal("Plain value", intervals[1].Values["lithologyComments"]);
    }

    [Fact]
    public void KeepsPrioritiesProjectsAndLoginsAsSeparateRows()
    {
        var (intervals, _) = DataViewerIntervals.Build(
        [
            Record("LithoFacies", "SS"),
            Record("LithoFacies", "CL", priority: 2),
            Record("LithoFacies", "GR", usr: "DOMAIN\\other"),
            Record("LithoFacies", "SI", project: "OTHER")
        ]);

        Assert.Equal(["SS", "CL", "GR", "SI"], intervals.Select(interval => interval.Values["lithoCode"]));
    }

    [Fact]
    public void GroupsDepthsByValueNotByScale()
    {
        var (intervals, _) = DataViewerIntervals.Build(
        [
            Record("LithoFacies", "SS", from: 10.0m, to: 12.50m),
            Record("Colour", "GY", from: 10.00m, to: 12.5m)
        ]);

        Assert.Single(intervals);
    }

    [Fact]
    public void LeavesMissingAttributesAbsentAndNullValuesNull()
    {
        var (intervals, _) = DataViewerIntervals.Build([Record("Colour", null)]);

        var values = Assert.Single(intervals).Values;
        Assert.Equal(["colorCode"], values.Keys);
        Assert.Null(values["colorCode"]);
        Assert.False(values.ContainsKey("omFacies"));
        Assert.False(values.ContainsKey("py"));
    }

    [Fact]
    public void CountsUnknownAndRepeatedNamesInsteadOfDroppingThemSilently()
    {
        var (intervals, hidden) = DataViewerIntervals.Build(
        [
            Record("LithoFacies", "SS"),
            Record("WellCAD_Extra", "x"),
            Record("lithofacies", "CL")
        ]);

        Assert.Equal("SS", Assert.Single(intervals).Values["lithoCode"]);
        Assert.Equal(2, hidden);
    }

    [Fact]
    public void ReturnsNothingForNoRecords()
    {
        var (intervals, hidden) = DataViewerIntervals.Build([]);

        Assert.Empty(intervals);
        Assert.Equal(0, hidden);
    }

    private static DataViewerRecord Record(
        string name,
        string? value,
        decimal from = 10m,
        decimal to = 12m,
        int priority = 1,
        string usr = "userAcquire",
        string project = "ZOOVCH",
        string? commentValue = null) => new()
    {
        HoleId = "DH001",
        ProjectCode = project,
        From = from,
        To = to,
        Priority = priority,
        Name = name,
        Value = value,
        CommentValue = commentValue,
        Usr = usr
    };
}
