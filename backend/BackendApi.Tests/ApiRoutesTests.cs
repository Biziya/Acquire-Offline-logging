using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests;

public sealed class ApiRoutesTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public ApiRoutesTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public void ExposesExactlyTheApplicationEndpoints()
    {
        var routes = _factory.Services
            .GetRequiredService<EndpointDataSource>()
            .Endpoints
            .OfType<RouteEndpoint>()
            .SelectMany(endpoint =>
                (endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["ANY"])
                .Select(method => $"{method} /{endpoint.RoutePattern.RawText}"))
            .Order()
            .ToList();

        Assert.Equal(
            [
                "GET /api/dataviewer",
                "GET /api/dataviewer/drillholes",
                "GET /api/drillholes",
                "GET /api/status",
                "GET /api/table-constants",
                "POST /api/upload-data"
            ],
            routes);
    }

    [Theory]
    [InlineData("/api/currentuser")]
    [InlineData("/api/lithocodes")]
    [InlineData("/api/colour")]
    [InlineData("/api/ca")]
    [InlineData("/api/om")]
    [InlineData("/api/omfacies")]
    [InlineData("/api/py")]
    [InlineData("/api/ox")]
    [InlineData("/api/sedim")]
    [InlineData("/api/redoxcode")]
    [InlineData("/api/uploaddata")]
    public async Task RemovedEndpointsAreGone(string route)
    {
        var response = await _factory.CreateClient().GetAsync(route);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
