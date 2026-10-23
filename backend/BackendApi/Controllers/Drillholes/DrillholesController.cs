using BackendApi.Models.Drillholes;
using BackendApi.Repositories.Drillholes;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.Drillholes;

[ApiController]
[Route("api/drillholes")]
[Tags("Drillholes")]
public sealed class DrillholesController : ControllerBase
{
    private readonly IDrillholeRepository _repository;
    private readonly ILogger<DrillholesController> _logger;

    public DrillholesController(
        IDrillholeRepository repository,
        ILogger<DrillholesController> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<DrillholeResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<IReadOnlyList<DrillholeResponse>>> GetAll(
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _repository.GetAllAsync(cancellationToken));
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(exception, "Failed to retrieve drillholes.");

            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = "Unable to retrieve drillholes." });
        }
    }
}
