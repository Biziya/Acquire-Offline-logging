using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.PyCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/py")]
[Tags("RawLitho")]
public sealed class PyCodeController : RawLithoControllerBase
{
    private readonly IPyRepository _repository;

    public PyCodeController(
        IPyRepository repository,
        ILogger<PyCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PyCodeDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<PyCodeDto>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "PY lookup values", cancellationToken);
}
