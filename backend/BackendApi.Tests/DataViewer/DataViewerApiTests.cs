using System.Net;
using System.Text.Json.Nodes;
using BackendApi.Models.DataViewer;
using BackendApi.Models.Drillholes;
using BackendApi.Repositories.DataViewer;
using BackendApi.Repositories.Drillholes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests.DataViewer;

public sealed class DataViewerApiTests : IClassFixture<ApiFactory>
{
    private const string Hole = "GTZO_0001_1";

    private readonly ApiFactory _factory;

    public DataViewerApiTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task ListsTheDrillholesWithStoredRecords()
    {
        var records = new FakeRecords { HoleIds = ["DH001", "DH002"] };

        var response = await CreateClient(records, new FakeDrillholes()).GetAsync("/api/dataviewer/drillholes");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("[\"DH001\",\"DH002\"]", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ListsNoDrillholesForAnEmptyTable()
    {
        var response = await CreateClient(new FakeRecords(), new FakeDrillholes()).GetAsync("/api/dataviewer/drillholes");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("[]", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ReturnsASafeErrorWhenTheDrillholeListFails()
    {
        var records = new FakeRecords { Failure = new InvalidOperationException("Invalid object name 'MyApps.CoreDescrData'.") };

        var response = await CreateClient(records, new FakeDrillholes()).GetAsync("/api/dataviewer/drillholes");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains("Unable to retrieve drillholes.", text);
        Assert.DoesNotContain("CoreDescrData", text);
    }

    [Fact]
    public async Task ReturnsOneIntervalPerFromToWithProjectAndCampaign()
    {
        var records = new FakeRecords(
            Record("LithoFacies", "0--", from: 5.0m, to: 10.0m),
            Record("Colour", "10G4/2", from: 5.0m, to: 10.0m),
            Record("LithoFacies", "SS", from: 10.0m, to: 12.5m));
        var drillholes = new FakeDrillholes(Collar("ZOOVCH", "2015"));

        var body = await GetOk(records, drillholes, Hole);

        Assert.Equal(Hole, body["drillhole"]!.GetValue<string>());
        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
        Assert.Equal("2015", body["campaign"]!.GetValue<string>());
        Assert.Equal(2, body["totalIntervals"]!.GetValue<int>());
        Assert.Equal(3, body["totalRecords"]!.GetValue<int>());
        Assert.Equal(0, body["hiddenValues"]!.GetValue<int>());
        Assert.Equal("[\"userAcquire\"]", body["storedBy"]!.ToJsonString());
        Assert.Equal("[\"yashgaa.json\"]", body["fileNames"]!.ToJsonString());

        var first = body["intervals"]![0]!.AsObject();
        Assert.Equal(
            ["projectCode", "lithoFrom", "lithoTo", "priority", "usr", "values"],
            first.Select(property => property.Key));
        Assert.Equal("5.0", first["lithoFrom"]!.ToJsonString());      // number, as stored
        Assert.Equal("10.0", first["lithoTo"]!.ToJsonString());
        Assert.Equal("{\"lithoCode\":\"0--\",\"colorCode\":\"10G4/2\"}", first["values"]!.ToJsonString());

        Assert.Equal([Hole], records.Requests);
        Assert.Equal([Hole], drillholes.Requests);
    }

    [Fact]
    public async Task ReturnsAnEmptyResultForADrillholeWithoutRecords()
    {
        var drillholes = new FakeDrillholes(Collar("ZOOVCH", "2015"));

        var body = await GetOk(new FakeRecords(), drillholes, "UNKNOWN_HOLE");

        Assert.Equal(0, body["totalIntervals"]!.GetValue<int>());
        Assert.Empty(body["intervals"]!.AsArray());
        Assert.Empty(body["projects"]!.AsArray());
        Assert.Null(body["project"]);
        Assert.Null(body["campaign"]);
        Assert.Empty(drillholes.Requests);    // nothing to look up
    }

    [Fact]
    public async Task LeavesCampaignEmptyWhenTheDrillholeListHasNoEntry()
    {
        var body = await GetOk(new FakeRecords(Record("Colour", "RED")), new FakeDrillholes(), Hole);

        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
        Assert.Null(body["campaign"]);
    }

    [Fact]
    public async Task MatchesTheCampaignOnHoleIdAndProjectCode()
    {
        var drillholes = new FakeDrillholes(Collar("OTHER", "2014"), Collar("zoovch ", "2015"));

        var body = await GetOk(new FakeRecords(Record("Colour", "RED")), drillholes, Hole);

        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
        Assert.Equal("2015", body["campaign"]!.GetValue<string>());
    }

    [Fact]
    public async Task NeverGuessesBetweenConflictingCampaigns()
    {
        var drillholes = new FakeDrillholes(Collar("ZOOVCH", "2015"), Collar("ZOOVCH", "2016"));

        var body = await GetOk(new FakeRecords(Record("Colour", "RED")), drillholes, Hole);

        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
        Assert.Null(body["campaign"]);
    }

    [Fact]
    public async Task ListsEveryStoredProjectWithoutPickingOne()
    {
        var records = new FakeRecords(
            Record("Colour", "RED"),
            Record("Colour", "GY", project: "OTHER"));
        var drillholes = new FakeDrillholes(Collar("ZOOVCH", "2015"), Collar("OTHER", "2014"));

        var body = await GetOk(records, drillholes, Hole);

        Assert.Null(body["project"]);
        Assert.Null(body["campaign"]);
        Assert.Equal(
            "[{\"projectCode\":\"ZOOVCH\",\"campaign\":\"2015\"},{\"projectCode\":\"OTHER\",\"campaign\":\"2014\"}]",
            body["projects"]!.ToJsonString());
        Assert.Equal(2, body["totalIntervals"]!.GetValue<int>());   // one per project
        Assert.Equal([Hole], drillholes.Requests);                  // one lookup, not one per project
    }

    [Fact]
    public async Task StillShowsTheRecordsWhenTheCampaignLookupFails()
    {
        var drillholes = new FakeDrillholes { Failure = new InvalidOperationException("ZOOVCH_COLLAR_LIST unavailable") };

        var body = await GetOk(new FakeRecords(Record("Colour", "RED")), drillholes, Hole);

        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
        Assert.Null(body["campaign"]);
        Assert.Equal(1, body["totalIntervals"]!.GetValue<int>());
    }

    [Theory]
    [InlineData("/api/dataviewer")]
    [InlineData("/api/dataviewer?drillhole=")]
    [InlineData("/api/dataviewer?drillhole=%20%20")]
    [InlineData("/api/dataviewer?drillhole=ABCDEFGHIJKLMNOPQRSTU")]
    public async Task RejectsAMissingOrInvalidDrillhole(string url)
    {
        var records = new FakeRecords();

        var response = await CreateClient(records, new FakeDrillholes()).GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(records.Requests);
    }

    [Fact]
    public async Task ReturnsASafeErrorWhenTheDatabaseFails()
    {
        var records = new FakeRecords { Failure = new InvalidOperationException("The SELECT permission was denied on the object 'CoreDescrData'.") };

        var response = await CreateClient(records, new FakeDrillholes()).GetAsync($"/api/dataviewer?drillhole={Hole}");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains("Unable to retrieve drillhole records.", text);
        Assert.DoesNotContain("CoreDescrData", text);
    }

    private async Task<JsonObject> GetOk(FakeRecords records, FakeDrillholes drillholes, string hole)
    {
        var response = await CreateClient(records, drillholes)
            .GetAsync($"/api/dataviewer?drillhole={Uri.EscapeDataString(hole)}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    }

    private HttpClient CreateClient(IDataViewerRepository records, IDrillholeRepository drillholes) =>
        _factory
            .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(records);
                services.AddSingleton(drillholes);
            }))
            .CreateClient();

    private static DataViewerRecord Record(
        string name,
        string value,
        decimal from = 5.0m,
        decimal to = 10.0m,
        string project = "ZOOVCH") => new()
    {
        HoleId = Hole,
        ProjectCode = project,
        From = from,
        To = to,
        Priority = 1,
        Name = name,
        Value = value,
        Usr = "userAcquire",
        FileName = "yashgaa.json"
    };

    private static DrillholeResponse Collar(string project, string campaign) =>
        new() { HoleId = Hole, ProjectCode = project, Campaign = campaign };

    private sealed class FakeRecords(params DataViewerRecord[] records) : IDataViewerRepository
    {
        public List<string> Requests { get; } = [];
        public IReadOnlyList<string> HoleIds { get; init; } = [];
        public Exception? Failure { get; init; }

        public Task<IReadOnlyList<string>> GetHoleIdsAsync(CancellationToken cancellationToken = default) =>
            Failure is null
                ? Task.FromResult(HoleIds)
                : Task.FromException<IReadOnlyList<string>>(Failure);

        public Task<IReadOnlyList<DataViewerRecord>> GetByHoleIdAsync(string holeId, CancellationToken cancellationToken = default)
        {
            Requests.Add(holeId);
            return Failure is null
                ? Task.FromResult<IReadOnlyList<DataViewerRecord>>(records)
                : Task.FromException<IReadOnlyList<DataViewerRecord>>(Failure);
        }
    }

    private sealed class FakeDrillholes(params DrillholeResponse[] collars) : IDrillholeRepository
    {
        public List<string> Requests { get; } = [];
        public Exception? Failure { get; init; }

        public Task<IReadOnlyList<DrillholeResponse>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<DrillholeResponse>>(collars);

        public Task<IReadOnlyList<DrillholeResponse>> GetByHoleIdAsync(string holeId, CancellationToken cancellationToken = default)
        {
            Requests.Add(holeId);
            return Failure is null
                ? Task.FromResult<IReadOnlyList<DrillholeResponse>>(collars)
                : Task.FromException<IReadOnlyList<DrillholeResponse>>(Failure);
        }
    }
}
