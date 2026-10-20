using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.Drillhole;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/drillholes")]
[Tags("RawLitho")]
public sealed class DrillholeController : RawLithoControllerBase
{
    private readonly IDrillholeRepository _repository;

    public DrillholeController(
        IDrillholeRepository repository,
        ILogger<DrillholeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<DrillholeResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<DrillholeResponse>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "drillholes", cancellationToken);
}
