using BackendApi.Models.RawLithoPage;
using BackendApi.Repositories.RawLithoPage.OmFaciesCode;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

[ApiController]
[Route("api/omfacies")]
[Tags("RawLitho")]
public sealed class OmFaciesCodeController : RawLithoControllerBase
{
    private readonly IOmFaciesRepository _repository;

    public OmFaciesCodeController(
        IOmFaciesRepository repository,
        ILogger<OmFaciesCodeController> logger)
        : base(logger)
    {
        _repository = repository;
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<OmFaciesCodeDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public Task<ActionResult<IReadOnlyList<OmFaciesCodeDto>>> GetAll(
        CancellationToken cancellationToken) =>
        GetAllOrErrorAsync(_repository.GetAllAsync, "OM Facies lookup values", cancellationToken);
}
