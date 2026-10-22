using System.Text;
using System.Text.Json;
using BackendApi.Models.UploadData;
using BackendApi.Repositories.UploadData;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace BackendApi.Controllers.UploadData;

[ApiController]
[Route("api/upload-data")]
[Tags("UploadData")]
public sealed class UploadDataController : ControllerBase
{
    private const string MaxFileSizeKey = "UploadData:MaxFileSizeBytes";
    private const long DefaultMaxFileSizeBytes = 10 * 1024 * 1024;

    // Rejects invalid UTF-8 instead of replacing it, so the text sent to the
    // database is exactly what was uploaded.
    private static readonly Encoding StrictUtf8 = new UTF8Encoding(
        encoderShouldEmitUTF8Identifier: false,
        throwOnInvalidBytes: true);

    private readonly IUploadDataRepository _repository;
    private readonly ILogger<UploadDataController> _logger;
    private readonly long _maxFileSizeBytes;

    public UploadDataController(
        IUploadDataRepository repository,
        IConfiguration configuration,
        ILogger<UploadDataController> logger)
    {
        _repository = repository;
        _logger = logger;
        _maxFileSizeBytes = configuration.GetValue(MaxFileSizeKey, DefaultMaxFileSizeBytes);
    }

    /// <summary>
    /// Validates an exported lithology JSON file and stores it through
    /// dbo.InsertUpdateCoreDescr_WellCAD ('Raw core import_JSON').
    /// </summary>
    [HttpPost]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<UploadDataResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<UploadDataResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<UploadDataResponse>(StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType<UploadDataResponse>(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<UploadDataResponse>> UploadAsync(
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return Failure(StatusCodes.Status400BadRequest, "No file was uploaded.");
        }

        if (file.Length > _maxFileSizeBytes)
        {
            return Failure(
                StatusCodes.Status413PayloadTooLarge,
                $"File exceeds the {_maxFileSizeBytes / (1024 * 1024)} MB limit.");
        }

        var fileName = Path.GetFileName(file.FileName);

        if (!string.Equals(Path.GetExtension(fileName), ".json", StringComparison.OrdinalIgnoreCase))
        {
            return Failure(StatusCodes.Status400BadRequest, "Only .json files are accepted.");
        }

        if (fileName.Length > UploadDataRepository.FileNameSize)
        {
            return Failure(
                StatusCodes.Status400BadRequest,
                $"File name must be {UploadDataRepository.FileNameSize} characters or fewer.");
        }

        string json;
        UploadDataValidator.Result result;

        try
        {
            using var reader = new StreamReader(file.OpenReadStream(), StrictUtf8);
            json = await reader.ReadToEndAsync(cancellationToken);
            result = UploadDataValidator.Validate(json);
        }
        catch (Exception exception) when (exception is JsonException or DecoderFallbackException)
        {
            return Failure(StatusCodes.Status400BadRequest, "Invalid JSON file.");
        }

        if (result.Errors.Count > 0)
        {
            return BadRequest(new UploadDataResponse
            {
                Success = false,
                Message = "Invalid lithology data.",
                Errors = result.Errors
            });
        }

        try
        {
            await _repository.UploadAsync(
                new UploadDataRequest
                {
                    Drillhole = result.Drillhole,
                    UserName = GetAuthenticatedUserName(),
                    FileName = fileName,
                    Json = json
                },
                cancellationToken);
        }
        catch (SqlException exception) when (IsPermissionDenied(exception))
        {
            // A database security setting, not a problem with the file: the
            // details (object, database, login) go to the log only.
            _logger.LogError(
                exception,
                "Upload of {FileName} for drillhole {Drillhole} failed: SQL Server denied a permission to the API login.",
                fileName,
                result.Drillhole);

            return Failure(
                StatusCodes.Status500InternalServerError,
                "Database upload failed due to insufficient permissions.");
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(
                exception,
                "Upload of {FileName} for drillhole {Drillhole} failed.",
                fileName,
                result.Drillhole);

            return Failure(StatusCodes.Status500InternalServerError, "Database upload failed.");
        }

        return Ok(new UploadDataResponse
        {
            Success = true,
            Message = "Data uploaded successfully.",
            Drillhole = result.Drillhole,
            Project = result.Project,
            TotalRows = result.TotalRows
        });
    }

    // Only an identity the server verified is passed on, never a name the
    // client sent. The endpoint is anonymous, so this is usually null.
    private string? GetAuthenticatedUserName() =>
        User.Identity is
        {
            IsAuthenticated: true,
            Name: { Length: > 0 and <= UploadDataRepository.UserSize } name
        }
            ? name
            : null;

    // 229: "The <permission> permission was denied on the object …";
    // 230: the same, on a column.
    private static bool IsPermissionDenied(SqlException exception) =>
        exception.Errors.Cast<SqlError>().Any(error => error.Number is 229 or 230);

    private ObjectResult Failure(int statusCode, string message) =>
        StatusCode(statusCode, new UploadDataResponse { Success = false, Message = message });
}
