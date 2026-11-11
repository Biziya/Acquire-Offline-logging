using System.Net;
using System.Security.Claims;
using BackendApi.Data;
using BackendApi.Models.Drillholes;
using BackendApi.Repositories.Drillholes;
using BackendApi.Tests.UploadData;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace BackendApi.Tests;

public sealed class WindowsUserImpersonationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public WindowsUserImpersonationTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public void ExecuteAsBatchQuotesTheLoginAndReturnsTheCookie()
    {
        var batch = DatabaseConnectionFactory.BuildExecuteAsBatch(@"BDOM\o'brien");

        Assert.Contains(@"EXECUTE AS LOGIN = N'BDOM\o''brien' WITH COOKIE INTO @revertCookie;", batch);
        Assert.Contains("SELECT @revertCookie;", batch);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("BDOM\\a\r\nREVERT")]
    public void ExecuteAsBatchRejectsInvalidLogins(string login)
    {
        Assert.Throws<ArgumentException>(() => DatabaseConnectionFactory.BuildExecuteAsBatch(login));
    }

    [Fact]
    public void ExecuteAsBatchRejectsLoginsLongerThanSysname()
    {
        Assert.Throws<ArgumentException>(() =>
            DatabaseConnectionFactory.BuildExecuteAsBatch("BDOM\\" + new string('a', 124)));
    }

    [Fact]
    public async Task FactoryRefusesToConnectWithoutAWindowsUser()
    {
        var factory = new DatabaseConnectionFactory(
            Configure(impersonate: true),
            new HttpContextAccessor { HttpContext = new DefaultHttpContext() },
            NullLogger<DatabaseConnectionFactory>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(() => factory.OpenAsync(DatabaseTarget.Default));
    }

    [Fact]
    public void FindsAPermissionErrorWrappedInAnotherException()
    {
        var wrapped = new InvalidOperationException("outer", SqlExceptionFactory.Create(15406, "Cannot execute as the server principal."));

        Assert.Equal(15406, DatabaseAccessErrors.Find(wrapped)?.Number);
        Assert.Null(DatabaseAccessErrors.Find(SqlExceptionFactory.Create(2627, "Violation of PRIMARY KEY constraint.")));
    }

    [Fact]
    public async Task ImpersonationOnChallengesAnonymousDataRequests()
    {
        var response = await CreateClient(impersonate: true, new FakeDrillholes(), userName: null)
            .GetAsync("/api/drillholes");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ImpersonationOnKeepsTheStatusCheckAnonymous()
    {
        var response = await CreateClient(impersonate: true, new FakeDrillholes(), userName: null)
            .GetAsync("/api/status");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ImpersonationOnServesAnAuthenticatedUser()
    {
        var response = await CreateClient(impersonate: true, new FakeDrillholes(), @"BDOM\jsmith")
            .GetAsync("/api/drillholes");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ImpersonationOffKeepsDataRequestsAnonymous()
    {
        var response = await CreateClient(impersonate: false, new FakeDrillholes(), userName: null)
            .GetAsync("/api/drillholes");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ReportsTheUsersMissingPermissionAs403()
    {
        var drillholes = new FakeDrillholes
        {
            Failure = SqlExceptionFactory.Create(229, "The SELECT permission was denied on the object 'ZOOVCH_COLLAR_LIST'.")
        };

        var response = await CreateClient(impersonate: true, drillholes, @"BDOM\jsmith").GetAsync("/api/drillholes");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains(@"BDOM\\jsmith has no database permission to read drillholes.", text);
        Assert.DoesNotContain("ZOOVCH_COLLAR_LIST", text);
    }

    private HttpClient CreateClient(bool impersonate, IDrillholeRepository drillholes, string? userName)
    {
        var client = _factory
            .WithWebHostBuilder(builder =>
            {
                builder.UseSetting(BackendApi.Data.ConfigurationExtensions.ImpersonateWindowsUserKey, impersonate.ToString());
                builder.ConfigureTestServices(services => services.AddSingleton(drillholes));
            })
            .CreateClient();

        if (userName is not null)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.UserHeader, userName);
        }

        return client;
    }

    private static IConfiguration Configure(bool impersonate) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = "Data Source=tcp:127.0.0.1,1;Initial Catalog=None;Integrated Security=True;Connect Timeout=1;",
                [BackendApi.Data.ConfigurationExtensions.ImpersonateWindowsUserKey] = impersonate.ToString()
            })
            .Build();

    private sealed class FakeDrillholes : IDrillholeRepository
    {
        public Exception? Failure { get; init; }

        public Task<IReadOnlyList<DrillholeResponse>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Failure is null
                ? Task.FromResult<IReadOnlyList<DrillholeResponse>>([])
                : Task.FromException<IReadOnlyList<DrillholeResponse>>(Failure);

        public Task<IReadOnlyList<DrillholeResponse>> GetByHoleIdAsync(string holeId, CancellationToken cancellationToken = default) =>
            GetAllAsync(cancellationToken);
    }
}
