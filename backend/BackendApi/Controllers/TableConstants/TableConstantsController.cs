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
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<TableConstantsResponse>> Get(
        CancellationToken cancellationToken)
    {
        return await DatabaseAccessDenied.ReadAsync(
            this, _logger, "read table constants", "Unable to retrieve table constants.",
            () => _repository.GetAllAsync(cancellationToken), cancellationToken);
    }
}
