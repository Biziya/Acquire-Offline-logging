using BackendApi.Models.TableConstants;
using BackendApi.Repositories.TableConstants;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.TableConstants;

[ApiController]
[Route("api/table-constants")]
[Tags("TableConstants")]
public sealed class TableConstantsController : ControllerBase
{
    private readonly ITableConstantsRepository _repository;
    private readonly ILogger<TableConstantsController> _logger;

    public TableConstantsController(
        ITableConstantsRepository repository,
        ILogger<TableConstantsController> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    /// <summary>All nine Raw Litho lookup lists in one response.</summary>
    [HttpGet]
    [ProducesResponseType<TableConstantsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<TableConstantsResponse>> Get(
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _repository.GetAllAsync(cancellationToken));
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(exception, "Failed to retrieve table constants.");

            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = "Unable to retrieve table constants." });
        }
    }
}
