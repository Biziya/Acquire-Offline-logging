using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.OxCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/ox")]
[Tags("RawLitho")]
public sealed class OxCodeController : RawLithoControllerBase
{
    private readonly IOxRepository _repository;

    public OxCodeController(
        IOxRepository repository,
        ILogger<OxCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<OxCodeDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<OxCodeDto>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "OX lookup values", cancellationToken);
}
