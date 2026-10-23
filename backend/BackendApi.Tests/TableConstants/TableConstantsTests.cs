using System.Net;
using System.Text.Json.Nodes;
using BackendApi.Models.TableConstants;
using BackendApi.Repositories.TableConstants;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests.TableConstants;

public sealed class TableConstantsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public TableConstantsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public void GroupsEachFieldNameIntoItsFormerList()
    {
        var response = TableConstantsRepository.Group(
        [
            new("Min1Qty", "1", "Low CA"),
            new("Colour", "10G4/2", "Greenish grey"),
            new("LithoFacies", "0--", "Unknown"),
            new("Min2Qty", "2", null),
            new("OM_Facies", "A", "Facies A"),
            new("Min4Qty", "Y", "Oxidised"),
            new("Min3Qty", "N", "No pyrite"),
            new("RedoxFacies", "0042_MN1", "Reduced"),
            new("InternalStructure", "LAM", "Laminated"),
            new("lithofacies", "SS", "Sandstone"),   // SQL Server matched case-insensitively
            new("SomethingElse", "X", "ignored")
        ]);

        Assert.Equal([new CaCodeItem("1", "Low CA")], response.CaCode);
        Assert.Equal([new ColourCodeItem("10G4/2", "Greenish grey")], response.ColourCode);
        Assert.Equal(
            [new LithoCodeItem("0--", "Unknown"), new LithoCodeItem("SS", "Sandstone")],
            response.LithoCode);
        Assert.Equal([new OmCodeItem("2", null)], response.OmCode);
        Assert.Equal([new OmFaciesCodeItem("A", "Facies A")], response.OmFaciesCode);
        Assert.Equal([new OxCodeItem("Y", "Oxidised")], response.OxCode);
        Assert.Equal([new PyCodeItem("N", "No pyrite")], response.PyCode);
        Assert.Equal([new RedoxCodeItem("0042_MN1", "Reduced")], response.RedoxCode);
        Assert.Equal([new SedimCodeItem("LAM", "Laminated")], response.SedimCode);
    }

    [Fact]
    public async Task ReturnsAllNineListsWithTheirFormerItemNames()
    {
        var data = TableConstantsRepository.Group(
        [
            new("Min1Qty", "1", "Low"), new("Colour", "RED", "Red"), new("LithoFacies", "SS", "Sandstone"),
            new("Min2Qty", "2", "OM"), new("OM_Facies", "A", "Facies"), new("Min4Qty", "Y", "Ox"),
            new("Min3Qty", "N", "Py"), new("RedoxFacies", "OX", "Redox"), new("InternalStructure", "LAM", "Sedim")
        ]);

        var response = await CreateClient(new FakeRepository(data)).GetAsync("/api/table-constants");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
        Assert.Equal(
            ["caCode", "colourCode", "lithoCode", "omCode", "omFaciesCode", "oxCode", "pyCode", "redoxCode", "sedimCode"],
            body.Select(property => property.Key));

        // Each item keeps the property name its old endpoint used.
        foreach (var (key, list) in body)
        {
            var item = Assert.Single(list!.AsArray())!.AsObject();
            Assert.Equal([key, "description"], item.Select(property => property.Key));
        }

        Assert.Equal("SS", body["lithoCode"]![0]!["lithoCode"]!.GetValue<string>());
        Assert.Equal("Sandstone", body["lithoCode"]![0]!["description"]!.GetValue<string>());
    }

    [Fact]
    public async Task ReturnsASafeErrorWhenTheDatabaseFails()
    {
        var repository = new FakeRepository(failure: new InvalidOperationException("Login failed for user 'userAcquire'."));

        var response = await CreateClient(repository).GetAsync("/api/table-constants");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains("Unable to retrieve table constants.", text);
        Assert.DoesNotContain("userAcquire", text);
    }

    private HttpClient CreateClient(ITableConstantsRepository repository) =>
        _factory
            .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
                services.AddSingleton(repository)))
            .CreateClient();

    private sealed class FakeRepository(
        TableConstantsResponse? data = null,
        Exception? failure = null) : ITableConstantsRepository
    {
        public Task<TableConstantsResponse> GetAllAsync(CancellationToken cancellationToken = default) =>
            failure is null ? Task.FromResult(data!) : Task.FromException<TableConstantsResponse>(failure);
    }
}
