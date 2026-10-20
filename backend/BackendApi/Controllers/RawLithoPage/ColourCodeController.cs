using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.ColourCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/colour")]
[Tags("RawLitho")]
public sealed class ColourCodeController : RawLithoControllerBase
{
    private readonly IColourRepository _repository;

    public ColourCodeController(
        IColourRepository repository,
        ILogger<ColourCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ColourCodeResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<ColourCodeResponse>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "colours", cancellationToken);
}
