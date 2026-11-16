using System.Net;
using System.Security.Claims;
using System.Text.Json.Nodes;
using BackendApi.Auth;
using AppConfig = BackendApi.Data.ConfigurationExtensions;
using BackendApi.Models.Drillholes;
using BackendApi.Repositories.Drillholes;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests.Auth;

public sealed class AllowedGroupAccessTests : IClassFixture<ApiFactory>
{
    private const string Group = @"BDOM\AcQuire_Uploaders";

    private readonly ApiFactory _factory;

    public AllowedGroupAccessTests(ApiFactory factory)
    {
        _factory = factory;
    }

    private const string SecondGroup = @"BDOM\Bek-Test-Group";

    [Fact]
    public void NoGroupConfiguredAllowsEveryone()
    {
        Assert.True(AllowedGroupAccess.IsAllowed(new ClaimsPrincipal(), []));
        Assert.True(AllowedGroupAccess.IsAllowed(null, ["  "]));
    }

    [Fact]
    public void MemberOfAnyConfiguredGroupIsAllowed()
    {
        var secondGroupMember = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, @"BDOM\bek"), new Claim(ClaimTypes.Role, SecondGroup)], "Windows"));
        var outsider = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, @"BDOM\other"), new Claim(ClaimTypes.Role, @"BDOM\Someone_Else")], "Windows"));

        Assert.True(AllowedGroupAccess.IsAllowed(secondGroupMember, [Group, SecondGroup]));
        Assert.False(AllowedGroupAccess.IsAllowed(outsider, [Group, SecondGroup]));
    }

    [Fact]
    public void ConfiguredGroupsMergeBothKeysWithoutBlanksOrDuplicates()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [$"{AppConfig.AllowedGroupsKey}:0"] = $" {Group} ",
                [$"{AppConfig.AllowedGroupsKey}:1"] = "",
                [$"{AppConfig.AllowedGroupsKey}:2"] = SecondGroup,
                [AppConfig.AllowedGroupKey] = Group.ToLowerInvariant(),
            })
            .Build();

        Assert.Equal([Group, SecondGroup], AppConfig.GetAllowedGroups(configuration));
    }

    [Fact]
    public void DotPrefixMeansALocalGroupOnThisComputer()
    {
        var localGroup = $@"{Environment.MachineName}\Bek-Test-Group";
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [$"{AppConfig.AllowedGroupsKey}:0"] = @" .\Bek-Test-Group ",
                [$"{AppConfig.AllowedGroupsKey}:1"] = localGroup.ToLowerInvariant(),
                [$"{AppConfig.AllowedGroupsKey}:2"] = Group,
            })
            .Build();

        Assert.Equal([localGroup, Group], AppConfig.GetAllowedGroups(configuration));
    }

    [Fact]
    public void NoKeysMeansNoGroups()
    {
        Assert.Empty(AppConfig.GetAllowedGroups(new ConfigurationBuilder().Build()));
    }

    [Fact]
    public void GroupConfiguredRequiresAnAuthenticatedMember()
    {
        var member = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, @"BDOM\jsmith"), new Claim(ClaimTypes.Role, Group)], "Windows"));
        var outsider = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, @"BDOM\other")], "Windows"));
        var anonymous = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, Group)]));

        Assert.True(AllowedGroupAccess.IsAllowed(member, [Group]));
        Assert.False(AllowedGroupAccess.IsAllowed(outsider, [Group]));
        Assert.False(AllowedGroupAccess.IsAllowed(anonymous, [Group]));
    }

    [Fact]
    public async Task MemberOfTheSecondGroupCanReadData()
    {
        var response = await Send([Group, SecondGroup], "/api/drillholes", @"BDOM\bek", SecondGroup);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task UserInNoneOfTheGroupsIsForbidden()
    {
        var response = await Send([Group, SecondGroup], "/api/drillholes", @"BDOM\other", @"BDOM\Someone_Else");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task OlderSingleGroupKeyStillWorks()
    {
        var client = _factory
            .WithWebHostBuilder(builder =>
            {
                builder.UseSetting(AppConfig.AllowedGroupKey, Group);
                builder.UseSetting(AppConfig.ImpersonateWindowsUserKey, "false");
                builder.ConfigureTestServices(services =>
                    services.AddSingleton<IDrillholeRepository>(new EmptyDrillholes()));
            })
            .CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/drillholes");
        request.Headers.Add(TestAuthHandler.UserHeader, @"BDOM\other");
        request.Headers.Add(TestAuthHandler.GroupsHeader, @"BDOM\Someone_Else");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task MemberCanReadData()
    {
        var response = await Send(Group, "/api/drillholes", @"BDOM\jsmith", Group);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task MemberWithSeveralGroupsCanReadData()
    {
        var response = await Send(Group, "/api/drillholes", @"BDOM\jsmith", @"BDOM\Other, " + Group);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task SignedInUserOutsideTheGroupIsForbidden()
    {
        var response = await Send(Group, "/api/drillholes", @"BDOM\other", @"BDOM\Someone_Else");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AnonymousRequestIsChallenged()
    {
        var response = await Send(Group, "/api/drillholes", userName: null, groups: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task NoGroupConfiguredKeepsTodaysBehaviour()
    {
        var response = await Send(allowedGroup: "", "/api/drillholes", userName: null, groups: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task PlainStatusStaysAnonymousWhenAGroupIsConfigured()
    {
        var response = await Send(Group, "/api/status", userName: null, groups: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData(Group, true)]
    [InlineData(@"BDOM\Someone_Else", false)]
    public async Task StatusReportsWhetherTheUserIsAuthorized(string userGroups, bool expected)
    {
        var response = await Send(Group, "/api/status?includeUser=true", @"BDOM\jsmith", userGroups);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal(@"BDOM\jsmith", body["userName"]!.GetValue<string>());
        Assert.Equal(expected, body["isAuthorized"]!.GetValue<bool>());
    }

    [Fact]
    public async Task StatusReportsAuthorizedWhenNoGroupIsConfigured()
    {
        var response = await Send(allowedGroup: "", "/api/status?includeUser=true", @"BDOM\jsmith", groups: null);

        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.True(body["isAuthorized"]!.GetValue<bool>());
    }

    private Task<HttpResponseMessage> Send(string allowedGroup, string path, string? userName, string? groups) =>
        Send(allowedGroup.Length == 0 ? [] : [allowedGroup], path, userName, groups);

    private Task<HttpResponseMessage> Send(string[] allowedGroups, string path, string? userName, string? groups)
    {
        var client = _factory
            .WithWebHostBuilder(builder =>
            {
                for (var index = 0; index < allowedGroups.Length; index++)
                {
                    builder.UseSetting($"{AppConfig.AllowedGroupsKey}:{index}", allowedGroups[index]);
                }

                builder.UseSetting(AppConfig.ImpersonateWindowsUserKey, "false");
                builder.ConfigureTestServices(services =>
                    services.AddSingleton<IDrillholeRepository>(new EmptyDrillholes()));
            })
            .CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, path);

        if (userName is not null)
        {
            request.Headers.Add(TestAuthHandler.UserHeader, userName);
        }

        if (groups is not null)
        {
            request.Headers.Add(TestAuthHandler.GroupsHeader, groups);
        }

        return client.SendAsync(request);
    }

    private sealed class EmptyDrillholes : IDrillholeRepository
    {
        public Task<IReadOnlyList<DrillholeResponse>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<DrillholeResponse>>([]);

        public Task<IReadOnlyList<DrillholeResponse>> GetByHoleIdAsync(string holeId, CancellationToken cancellationToken = default) =>
            GetAllAsync(cancellationToken);
    }
}
