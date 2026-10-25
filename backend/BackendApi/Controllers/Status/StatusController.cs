using BackendApi.Models.Status;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.Status;

[ApiController]
[Route("api/status")]
[Produces("application/json")]
public sealed class StatusController : ControllerBase
{
    private const string Online = "online";
    private const string Message = "Backend connection successful";

    /// <summary>
    /// Backend online check. With <c>includeUser=true</c> it also returns the
    /// calling Windows user (see <see cref="WindowsUser"/>); the browser is
    /// challenged for it. Without it the endpoint is anonymous, as before.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<StatusResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult Get([FromQuery] bool includeUser = false)
    {
        if (!includeUser)
        {
            return Ok(new StatusResponse(Online, Message));
        }

        if (WindowsUser.GetName(User) is not { } userName)
        {
            // 401 + WWW-Authenticate: Negotiate; browsers then authenticate
            // automatically for localhost / Local intranet sites.
            return Challenge(NegotiateDefaults.AuthenticationScheme);
        }

        return Ok(new StatusResponse(Online, Message, userName));
    }
}
