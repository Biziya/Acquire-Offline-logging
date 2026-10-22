using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using BackendApi.Models.UploadData;
using BackendApi.Repositories.UploadData;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests.UploadData;

public sealed class UploadDataApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Route = "/api/upload-data";

    private readonly WebApplicationFactory<Program> _factory;

    public UploadDataApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task UploadsTheOriginalJsonOnceAndReportsTheRowCount()
    {
        var repository = new FakeUploadDataRepository();
        // Unusual spacing and an unknown field must reach the procedure untouched.
        var json = TestDocuments.Valid().ToJsonString().Replace("{", "{ ") +
                   "\n";

        var response = await CreateClient(repository).PostAsync(Route, FileContent(json));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<UploadDataResponse>();
        Assert.True(body!.Success);
        Assert.Equal("Data uploaded successfully.", body.Message);
        Assert.Equal("GTZO_0001_1", body.Drillhole);
        Assert.Equal("ZOOVCH", body.Project);
        Assert.Equal(1, body.TotalRows);

        var call = Assert.Single(repository.Calls);
        Assert.Equal(json, call.Json);
        Assert.Equal("GTZO_0001_1", call.Drillhole);
        Assert.Equal("upload.json", call.FileName);
        Assert.Null(call.UserName);
    }

    [Fact]
    public async Task PassesOnlyAServerVerifiedUserName()
    {
        var repository = new FakeUploadDataRepository();
        var client = CreateClient(repository);
        var content = FileContent(TestDocuments.Valid().ToJsonString());
        // A user name sent as a form field is not an identity and is ignored.
        content.Add(new StringContent("CORP\\spoofed"), "usr");

        var request = new HttpRequestMessage(HttpMethod.Post, Route) { Content = content };
        request.Headers.Add(TestAuthHandler.UserHeader, "CORP\\bek");
        await client.SendAsync(request);
        await client.PostAsync(Route, FileContent(TestDocuments.Valid().ToJsonString()));

        Assert.Equal(["CORP\\bek", null], repository.Calls.Select(call => call.UserName));
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
        Assert.Equal(json, call.Json);
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

    // A null repository keeps the real UploadDataRepository.
    private HttpClient CreateClient(
        FakeUploadDataRepository? repository,
        params (string Key, string Value)[] settings) =>
        _factory
            .WithWebHostBuilder(builder =>
            {
                foreach (var (key, value) in settings)
                {
                    builder.UseSetting(key, value);
                }

                builder.ConfigureTestServices(services =>
                {
                    // TestServer cannot run Negotiate; keep the scheme, swap its handler.
                    services.PostConfigure<AuthenticationOptions>(options =>
                        options.SchemeMap[NegotiateDefaults.AuthenticationScheme].HandlerType =
                            typeof(TestAuthHandler));

                    if (repository is not null)
                    {
                        services.AddSingleton<IUploadDataRepository>(repository);
                    }
                });
            })
            .CreateClient();

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
