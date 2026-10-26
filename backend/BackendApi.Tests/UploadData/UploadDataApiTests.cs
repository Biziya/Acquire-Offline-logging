using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using BackendApi.Models.UploadData;
using BackendApi.Repositories.UploadData;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests.UploadData;

public sealed class UploadDataApiTests : IClassFixture<ApiFactory>
{
    private const string Route = "/api/upload-data";

    private readonly ApiFactory _factory;

    public UploadDataApiTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task SendsTheFilteredJsonOnceAndReportsTheRowCount()
    {
        var repository = new FakeUploadDataRepository();
        var json = TestDocuments.Valid().ToJsonString();

        var response = await CreateClient(repository).PostAsync(Route, FileContent(json));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<UploadDataResponse>();
        Assert.True(body!.Success);
        Assert.Equal("Data uploaded successfully.", body.Message);
        Assert.Equal("GTZO_0001_1", body.Drillhole);
        Assert.Equal("ZOOVCH", body.Project);
        Assert.Equal(1, body.TotalRows);

        var call = Assert.Single(repository.Calls);
        Assert.Equal(TestDocuments.ValidStoredProcedureJson, call.Json);
        Assert.Equal("GTZO_0001_1", call.Drillhole);
        Assert.Equal("upload.json", call.FileName);
        Assert.Equal(@"BDOM\jsmith", call.UserName);
    }

    [Fact]
    public async Task ProcessesEveryRowInOneProcedureCall()
    {
        // The size of the reference export yashgaa.json (53 rows).
        var repository = new FakeUploadDataRepository();
        var json = TestDocuments.WithRows(53).ToJsonString();

        var response = await CreateClient(repository)
            .PostAsync(Route, FileContent(json, "yashgaa.json"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<UploadDataResponse>();
        Assert.Equal(53, body!.TotalRows);
        var call = Assert.Single(repository.Calls);
        Assert.Equal(53, JsonNode.Parse(call.Json)!["rows"]!.AsArray().Count);
        Assert.Equal("yashgaa.json", call.FileName);
    }

    [Fact]
    public async Task RejectsInvalidJsonWithoutCallingTheDatabase()
    {
        var repository = new FakeUploadDataRepository();

        var response = await CreateClient(repository).PostAsync(Route, FileContent("{ \"rows\": [ }"));

        await AssertFailure(response, HttpStatusCode.BadRequest, "Invalid JSON file.");
        Assert.Empty(repository.Calls);
    }

    [Fact]
    public async Task RejectsInvalidUtf8AsInvalidJson()
    {
        var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent([0x7B, 0xFF, 0x7D]), "file", "upload.json");

        var response = await CreateClient(new FakeUploadDataRepository()).PostAsync(Route, content);

        await AssertFailure(response, HttpStatusCode.BadRequest, "Invalid JSON file.");
    }

    [Fact]
    public async Task ReturnsRowErrorsForInvalidLithologyData()
    {
        var repository = new FakeUploadDataRepository();
        var document = TestDocuments.Valid();
        document.Remove("drillhole");
        document["rows"]![0]!["lithoTo"] = "1";

        var response = await CreateClient(repository).PostAsync(Route, FileContent(document.ToJsonString()));

        var body = await AssertFailure(response, HttpStatusCode.BadRequest, "Invalid lithology data.");
        Assert.Equal(
            ["drillhole is required and must be text.", "Row 1: lithoFrom must be less than lithoTo."],
            body.Errors);
        Assert.Empty(repository.Calls);
    }

    [Fact]
    public async Task RejectsARequestWithoutAFile()
    {
        var content = new MultipartFormDataContent { { new StringContent("x"), "other" } };

        var response = await CreateClient(new FakeUploadDataRepository()).PostAsync(Route, content);

        await AssertFailure(response, HttpStatusCode.BadRequest, "No file was uploaded.");
    }

    [Fact]
    public async Task RejectsANonJsonFile()
    {
        var response = await CreateClient(new FakeUploadDataRepository())
            .PostAsync(Route, FileContent("{}", "upload.txt"));

        await AssertFailure(response, HttpStatusCode.BadRequest, "Only .json files are accepted.");
    }

    [Fact]
    public async Task RejectsAFileNameLongerThanTheFileNameParameter()
    {
        var response = await CreateClient(new FakeUploadDataRepository())
            .PostAsync(Route, FileContent("{}", new string('a', 46) + ".json"));

        await AssertFailure(response, HttpStatusCode.BadRequest, "File name must be 50 characters or fewer.");
    }

    [Fact]
    public async Task RejectsAFileOverTheConfiguredLimit()
    {
        var repository = new FakeUploadDataRepository();
        var client = CreateClient(repository, ("UploadData:MaxFileSizeBytes", "16"));

        var response = await client.PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        await AssertFailure(response, HttpStatusCode.RequestEntityTooLarge, "File exceeds the 0 MB limit.");
        Assert.Empty(repository.Calls);
    }

    [Fact]
    public async Task HidesStoredProcedureErrors()
    {
        var repository = new FakeUploadDataRepository
        {
            Failure = new InvalidOperationException("Login failed for user 'userAcquire'.")
        };

        var response = await CreateClient(repository).PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        await AssertFailure(response, HttpStatusCode.InternalServerError, "Database upload failed.");
        Assert.DoesNotContain("userAcquire", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ReportsAPermissionDenialWithoutDatabaseDetails()
    {
        // The exact error reported by the running API.
        var repository = new FakeUploadDataRepository
        {
            Failure = SqlExceptionFactory.Create(
                229,
                "The INSERT permission was denied on the object 'CoreDescrData', database 'ACQMN01', schema 'MyApps'.")
        };

        var response = await CreateClient(repository).PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        await AssertFailure(
            response,
            HttpStatusCode.InternalServerError,
            "Database upload is blocked by SQL Server permissions. Contact the database administrator.");
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("CoreDescrData", text);
        Assert.DoesNotContain("ACQMN01", text);
    }

    [Fact]
    public async Task ReportsOtherSqlErrorsAsAGenericFailure()
    {
        var repository = new FakeUploadDataRepository
        {
            Failure = SqlExceptionFactory.Create(2627, "Violation of PRIMARY KEY constraint 'PK_CoreDescrData'.")
        };

        var response = await CreateClient(repository).PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        await AssertFailure(response, HttpStatusCode.InternalServerError, "Database upload failed.");
    }

    [Fact]
    public async Task ReturnsASafeErrorWhenSqlServerIsUnavailable()
    {
        // The real repository against a port nothing listens on.
        var client = CreateClient(
            repository: null,
            ("ConnectionStrings:DefaultConnection",
             "Data Source=tcp:127.0.0.1,1;Initial Catalog=None;Integrated Security=True;Connect Timeout=2;TrustServerCertificate=True;"));

        var response = await client.PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        await AssertFailure(response, HttpStatusCode.InternalServerError, "Database upload failed.");
        Assert.DoesNotContain("127.0.0.1", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task RejectsAnAnonymousUploadWithoutCallingTheDatabase()
    {
        var repository = new FakeUploadDataRepository();
        var client = CreateClient(repository);
        client.DefaultRequestHeaders.Remove(TestAuthHandler.UserHeader);

        var response = await client.PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(repository.Calls);
    }

    [Fact]
    public async Task SendsTheVerifiedWindowsUserNotANameFromTheRequest()
    {
        var repository = new FakeUploadDataRepository();
        var client = CreateClient(repository);
        client.DefaultRequestHeaders.Remove(TestAuthHandler.UserHeader);
        client.DefaultRequestHeaders.Add(TestAuthHandler.UserHeader, @"BDOM\adoe");
        var document = TestDocuments.Valid();
        document["created_by"] = @"BDOM\someoneelse";
        document["edited_by"] = @"BDOM\someoneelse";
        var content = FileContent(document.ToJsonString());
        content.Add(new StringContent(@"BDOM\someoneelse"), "usr");
        content.Add(new StringContent(@"BDOM\someoneelse"), "userName");

        var response = await client.PostAsync(Route, content);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(@"BDOM\adoe", Assert.Single(repository.Calls).UserName);
    }

    [Fact]
    public async Task ReportsAUserSqlServerDoesNotAuthorizeAs403()
    {
        var repository = new FakeUploadDataRepository
        {
            Failure = new UploadNotAuthorizedException(@"BDOM\jsmith", new InvalidOperationException("51001"))
        };

        var response = await CreateClient(repository).PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        await AssertFailure(
            response,
            HttpStatusCode.Forbidden,
            @"BDOM\jsmith is not authorized to upload data. Contact the database administrator.");
    }

    [Fact]
    public async Task RejectsAWindowsUserLongerThanTheUserParameter()
    {
        var repository = new FakeUploadDataRepository();
        var client = CreateClient(repository);
        client.DefaultRequestHeaders.Remove(TestAuthHandler.UserHeader);
        client.DefaultRequestHeaders.Add(TestAuthHandler.UserHeader, "BDOM\\" + new string('a', 46));

        var response = await client.PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        await AssertFailure(response, HttpStatusCode.BadRequest, "Windows user name must be 50 characters or fewer.");
        Assert.Empty(repository.Calls);
    }

    // A null repository keeps the real UploadDataRepository. The client is
    // signed in as BDOM\jsmith.
    private HttpClient CreateClient(
        FakeUploadDataRepository? repository,
        params (string Key, string Value)[] settings)
    {
        var client = _factory
            .WithWebHostBuilder(builder =>
            {
                foreach (var (key, value) in settings)
                {
                    builder.UseSetting(key, value);
                }

                if (repository is not null)
                {
                    builder.ConfigureTestServices(services =>
                        services.AddSingleton<IUploadDataRepository>(repository));
                }
            })
            .CreateClient();

        client.DefaultRequestHeaders.Add(TestAuthHandler.UserHeader, @"BDOM\jsmith");
        return client;
    }

    private static MultipartFormDataContent FileContent(string json, string fileName = "upload.json")
    {
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(json));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/json");

        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    private static async Task<UploadDataResponse> AssertFailure(
        HttpResponseMessage response,
        HttpStatusCode statusCode,
        string message)
    {
        Assert.Equal(statusCode, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<UploadDataResponse>();
        Assert.False(body!.Success);
        Assert.Equal(message, body.Message);
        return body;
    }

    private sealed class FakeUploadDataRepository : IUploadDataRepository
    {
        public List<UploadDataRequest> Calls { get; } = [];

        public Exception? Failure { get; init; }

        public Task UploadAsync(UploadDataRequest request, CancellationToken cancellationToken = default)
        {
            Calls.Add(request);
            return Failure is null ? Task.CompletedTask : Task.FromException(Failure);
        }
    }
}
