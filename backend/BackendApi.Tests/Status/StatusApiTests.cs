using System.Net;
using System.Text.Json.Nodes;

namespace BackendApi.Tests.Status;

public sealed class StatusApiTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public StatusApiTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task PlainStatusStaysAnonymousAndCarriesNoUser()
    {
        var response = await _factory.CreateClient().GetAsync("/api/status");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
        Assert.Equal("online", body["status"]!.GetValue<string>());
        Assert.False(body.ContainsKey("userName"));
    }

    [Fact]
    public async Task IncludeUserChallengesARequestWithoutWindowsCredentials()
    {
        var response = await _factory.CreateClient().GetAsync("/api/status?includeUser=true");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("COMPANY\\bek", "COMPANY\\bek")]   // domain account: kept as is
    [InlineData("BEK", "BEK")]
    public async Task IncludeUserReturnsTheVerifiedWindowsUser(string windowsName, string expected)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/status?includeUser=true");
        request.Headers.Add(TestAuthHandler.UserHeader, windowsName);

        var response = await _factory.CreateClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal(expected, body["userName"]!.GetValue<string>());
    }

    [Fact]
    public async Task DropsTheComputerNameOfALocalAccount()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/status?includeUser=true");
        request.Headers.Add(TestAuthHandler.UserHeader, $"{Environment.MachineName}\\Bek");

        var response = await _factory.CreateClient().SendAsync(request);

        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal("Bek", body["userName"]!.GetValue<string>());
    }
}
