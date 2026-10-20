using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.CaCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/ca")]
[Tags("RawLitho")]
public sealed class CaCodeController : RawLithoControllerBase
{
    private readonly ICaRepository _repository;

    public CaCodeController(
        ICaRepository repository,
        ILogger<CaCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CaCodeDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<CaCodeDto>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "CA lookup values", cancellationToken);
}
