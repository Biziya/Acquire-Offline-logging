using System.Text.Json;
using System.Text.Json.Serialization;
using BackendApi.Models.UploadData;
using BackendApi.Repositories.UploadData;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.UploadData;

[ApiController]
[Route("api/uploaddata")]
[Tags("UploadData")]
public sealed class UploadDataController : ControllerBase
{
    private static readonly JsonSerializerOptions InputJsonOptions =
        new(JsonSerializerDefaults.Web)
        {
            NumberHandling = JsonNumberHandling.AllowReadingFromString
        };

    private readonly IUploadDataRepository _repository;
    private readonly ILogger<UploadDataController> _logger;

    public UploadDataController(
        IUploadDataRepository repository,
        ILogger<UploadDataController> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    [HttpPost]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(
        typeof(UploadDataResponse),
        StatusCodes.Status200OK)]
    [ProducesResponseType(
        typeof(ProblemDetails),
        StatusCodes.Status400BadRequest)]
    [ProducesResponseType(
        typeof(ProblemDetails),
        StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UploadAsync(
        IFormFile file,
        CancellationToken cancellationToken)
    {
        var fileError = ValidateFile(file);

        if (fileError is not null)
        {
            return fileError;
        }

        UploadDataRequest? request;

        try
        {
            request = await ReadRequestAsync(file, cancellationToken);
        }
        catch (JsonException exception)
        {
            return BadRequestProblem("Invalid JSON", exception.Message);
        }

        var requestError = ValidateRequest(request);

        if (requestError is not null)
        {
            return requestError;
        }

        var project = request!.Project!.Trim();
        var drillhole = request.Drillhole!.Trim();
        var rows = request.Rows!;

        var processedJson = BuildProcessedJson(project, drillhole, rows);

        return await SaveAsync(processedJson, drillhole, rows.Count, cancellationToken);
    }

    private IActionResult? ValidateFile(IFormFile file)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequestProblem(
                "Invalid upload",
                "A non-empty JSON file is required.");
        }

        if (!HasJsonExtension(file.FileName))
        {
            return BadRequestProblem(
                "Invalid file type",
                "Only .json files are accepted.");
        }

        return null;
    }

    private IActionResult? ValidateRequest(UploadDataRequest? request)
    {
        if (request is null)
        {
            return BadRequestProblem(
                "Invalid JSON",
                "The uploaded file does not contain a JSON object.");
        }

        if (string.IsNullOrWhiteSpace(request.Project) ||
            string.IsNullOrWhiteSpace(request.Drillhole))
        {
            return BadRequestProblem(
                "Missing required data",
                "The project and drillhole fields are required.");
        }

        if (request.Rows is null)
        {
            return BadRequestProblem(
                "Missing required data",
                "The rows field is required.");
        }

        if (request.Rows.Count == 0)
        {
            return BadRequestProblem(
                "Missing row data",
                "At least one Raw Lithology row is required.");
        }

        if (request.Rows.Any(row => row is null))
        {
            return BadRequestProblem(
                "Invalid row data",
                "The rows array cannot contain null values.");
        }

        return null;
    }

    private async Task<IActionResult> SaveAsync(
        string processedJson,
        string drillhole,
        int rowsSubmitted,
        CancellationToken cancellationToken)
    {
        try
        {
            await _repository.UploadAsync(processedJson, cancellationToken);

            return Ok(new UploadDataResponse
            {
                Success = true,
                Message = "Raw Lithology data uploaded successfully.",
                Drillhole = drillhole,
                RowsSubmitted = rowsSubmitted
            });
        }
        catch (OperationCanceledException)
            when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogError(
                exception,
                "Raw Lithology upload failed for drillhole {Drillhole}.",
                drillhole);

            return Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Database operation failed",
                detail: "The Raw Lithology data could not be saved.");
        }
    }

    private static async Task<UploadDataRequest?> ReadRequestAsync(
        IFormFile file,
        CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();

        return await JsonSerializer.DeserializeAsync<UploadDataRequest>(
            stream,
            InputJsonOptions,
            cancellationToken);
    }

    private static string BuildProcessedJson(
        string project,
        string drillhole,
        List<UploadDataRowRequest?> rows)
    {
        var payload = new
        {
            project,
            drillhole,

            rows = rows
                .Select(row => new
                {
                    lithoFrom = row!.LithoFrom,
                    lithoTo = row.LithoTo,
                    lithoCode = row.LithoCode ?? string.Empty,
                    colorCode = row.ColorCode ?? string.Empty,
                    ca = row.Ca ?? string.Empty,
                    om = row.Om ?? string.Empty,
                    omFacies = row.OmFacies ?? string.Empty,
                    py = row.Py ?? string.Empty,
                    ox = row.Ox ?? string.Empty,
                    sedim = row.Sedim ?? string.Empty,
                    redoxCode = row.RedoxCode ?? string.Empty,
                    granulo = row.Granulo ?? string.Empty,
                    hardness = row.Hardness ?? string.Empty,
                    lithologyComments = row.LithologyComments ?? string.Empty
                })
                .ToList()
        };

        return JsonSerializer.Serialize(payload);
    }

    private static bool HasJsonExtension(string fileName) =>
        string.Equals(
            Path.GetExtension(fileName),
            ".json",
            StringComparison.OrdinalIgnoreCase);

    private IActionResult BadRequestProblem(string title, string detail) =>
        Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: title,
            detail: detail);
}
