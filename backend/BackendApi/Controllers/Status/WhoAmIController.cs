using BackendApi.Models.Status;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.Status;

[ApiController]
[Route("api/whoami")]
[Produces("application/json")]
[Tags("Status")]
public sealed class WhoAmIController : ControllerBase
{
    /// <summary>
    /// The calling Windows user (see <see cref="WindowsUser"/>): the name Upload
    /// Data shows as "Imported By" and sends to the stored procedure as @usr.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<WhoAmIResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult Get()
    {
        if (WindowsUser.GetName(User) is not { } userName)
        {
            // 401 + WWW-Authenticate: Negotiate; browsers then authenticate
            // automatically for localhost / Local intranet sites.
            return Challenge(NegotiateDefaults.AuthenticationScheme);
        }

        return Ok(new WhoAmIResponse(userName));
    }
}
