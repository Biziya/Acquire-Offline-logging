using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.SedimCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/sedim")]
[Tags("RawLitho")]
public sealed class SedimCodeController : RawLithoControllerBase
{
    private readonly ISedimRepository _repository;

    public SedimCodeController(
        ISedimRepository repository,
        ILogger<SedimCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<SedimCodeDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<SedimCodeDto>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "Sedim lookup values", cancellationToken);
}
