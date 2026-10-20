using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.LithoCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/lithocodes")]
[Tags("RawLitho")]
public sealed class LithoCodeController : RawLithoControllerBase
{
    private readonly ILithoCodeRepository _repository;

    public LithoCodeController(
        ILithoCodeRepository repository,
        ILogger<LithoCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<LithoCodeResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<LithoCodeResponse>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "lithology codes", cancellationToken);
}
