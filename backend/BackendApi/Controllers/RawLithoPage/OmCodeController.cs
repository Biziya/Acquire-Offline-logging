using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.OmCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/om")]
[Tags("RawLitho")]
public sealed class OmCodeController : RawLithoControllerBase
{
    private readonly IOmRepository _repository;

    public OmCodeController(
        IOmRepository repository,
        ILogger<OmCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<OmCodeDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<OmCodeDto>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "OM lookup values", cancellationToken);
}
