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

public sealed class DataViewerApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Hole = "GTZO_0001_1";

    private readonly WebApplicationFactory<Program> _factory;

    public DataViewerApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task ReturnsTheDrillholeRecordsWithProjectAndCampaign()
    {
        var records = new FakeRecords(
            Record("LithoFacies", "0--", from: 5.0m, to: 10.0m),
            Record("Colour", "10G4/2", from: 5.0m, to: 10.0m));
        var drillholes = new FakeDrillholes(Collar("ZOOVCH", "2015"));

        var body = await GetOk(records, drillholes, Hole);

        Assert.Equal(Hole, body["drillhole"]!.GetValue<string>());
        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
        Assert.Equal("2015", body["campaign"]!.GetValue<string>());
        Assert.Equal(2, body["totalRecords"]!.GetValue<int>());

        var first = body["records"]![0]!.AsObject();
        Assert.Equal(
            ["holeId", "projectCode", "from", "to", "priority", "name", "value", "commentValue",
             "consistentCheck", "usr", "fileName", "pathName", "createdAt", "modifiedAt", "importedBy"],
            first.Select(property => property.Key));
        Assert.Equal("LithoFacies", first["name"]!.GetValue<string>());
        Assert.Equal("0--", first["value"]!.GetValue<string>());
        Assert.Equal("5.0", first["from"]!.ToJsonString());      // number, as stored
        Assert.Equal("1", first["priority"]!.ToJsonString());
        Assert.Equal("\"2026-10-22T10:00:00\"", first["createdAt"]!.ToJsonString());

        // Database NULLs stay null; nothing is filled in.
        Assert.Null(first["commentValue"]);
        Assert.Null(first["consistentCheck"]);
        Assert.Null(first["fileName"]);
        Assert.Null(first["importedBy"]);

        Assert.Equal([Hole], records.Requests);
        Assert.Equal([Hole], drillholes.Requests);
    }

    [Fact]
    public async Task ReturnsAnEmptyResultForADrillholeWithoutRecords()
    {
        var body = await GetOk(new FakeRecords(), new FakeDrillholes(Collar("ZOOVCH", "2015")), "UNKNOWN_HOLE");

        Assert.Equal(0, body["totalRecords"]!.GetValue<int>());
        Assert.Empty(body["records"]!.AsArray());
        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
    }

    [Fact]
    public async Task LeavesCampaignEmptyWhenTheDrillholeListHasNoEntry()
    {
        var body = await GetOk(new FakeRecords(Record("Colour", "RED")), new FakeDrillholes(), Hole);

        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());   // from the stored rows
        Assert.Null(body["campaign"]);
    }

    [Fact]
    public async Task PicksTheDrillholeEntryMatchingTheStoredProject()
    {
        var drillholes = new FakeDrillholes(Collar("OTHER", "2014"), Collar("ZOOVCH", "2015"));

        var body = await GetOk(new FakeRecords(Record("Colour", "RED")), drillholes, Hole);

        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
        Assert.Equal("2015", body["campaign"]!.GetValue<string>());
    }

    [Fact]
    public async Task NeverGuessesBetweenConflictingDrillholeEntries()
    {
        var drillholes = new FakeDrillholes(Collar("ZOOVCH", "2015"), Collar("ZOOVCH", "2016"));

        var body = await GetOk(new FakeRecords(Record("Colour", "RED")), drillholes, Hole);

        Assert.Equal("ZOOVCH", body["project"]!.GetValue<string>());
        Assert.Null(body["campaign"]);
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

    private static DataViewerRecord Record(string name, string value, decimal from = 5.0m, decimal to = 10.0m) => new()
    {
        HoleId = Hole,
        ProjectCode = "ZOOVCH",
        From = from,
        To = to,
        Priority = 1,
        Name = name,
        Value = value,
        Usr = "userAcquire",
        CreatedAt = new DateTime(2026, 10, 22, 10, 0, 0)
    };

    private static DrillholeResponse Collar(string project, string campaign) =>
        new() { HoleId = Hole, ProjectCode = project, Campaign = campaign };

    private sealed class FakeRecords(params DataViewerRecord[] records) : IDataViewerRepository
    {
        public List<string> Requests { get; } = [];
        public Exception? Failure { get; init; }

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

        public Task<IReadOnlyList<DrillholeResponse>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<DrillholeResponse>>(collars);

        public Task<IReadOnlyList<DrillholeResponse>> GetByHoleIdAsync(string holeId, CancellationToken cancellationToken = default)
        {
            Requests.Add(holeId);
            return Task.FromResult<IReadOnlyList<DrillholeResponse>>(collars);
        }
    }
}
