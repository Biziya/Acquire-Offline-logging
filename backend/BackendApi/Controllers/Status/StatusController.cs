using BackendApi.Models.Status;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.Status;

[ApiController]
[Route("api/status")]
[Produces("application/json")]
public sealed class StatusController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<StatusResponse>(StatusCodes.Status200OK)]
    public ActionResult<StatusResponse> Get()
    {
        return Ok(new StatusResponse(
            Status: "online",
            Message: "Backend connection successful"));
    }
}
