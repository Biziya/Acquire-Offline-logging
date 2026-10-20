using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.RedoxCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/redoxcode")]
[Tags("RawLitho")]
public sealed class RedoxCodeController : RawLithoControllerBase
{
    private readonly IRedoxCodeRepository _repository;

    public RedoxCodeController(
        IRedoxCodeRepository repository,
        ILogger<RedoxCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<RedoxCodeDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<RedoxCodeDto>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "Redox Code lookup values", cancellationToken);
}
