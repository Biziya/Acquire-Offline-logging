using BackendApi.Models.CurrentUser;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.CurrentUser;

/*
 * The Windows user who is calling the API, as proven by Windows Integrated
 * Authentication (Negotiate: Kerberos or NTLM). The browser sends the signed-in
 * user's credentials; nothing is read from the request body, headers the
 * client controls, the host name or configuration.
 *
 * Only this endpoint requires authentication; every other endpoint stays
 * anonymous as before.
 */
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
[Authorize(AuthenticationSchemes = NegotiateDefaults.AuthenticationScheme)]
public sealed class CurrentUserController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<CurrentUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<CurrentUserResponse> Get()
    {
        var name = User.Identity?.Name;

        if (string.IsNullOrWhiteSpace(name))
        {
            return Unauthorized();
        }

        return Ok(new CurrentUserResponse(ToDisplayName(name)));
    }

    /*
     * Windows reports every account as "AUTHORITY\user". For a domain account
     * the authority is the domain ("COMPANY\bek") and is kept. For a local
     * account it is this computer's name ("DESKTOP-1\BEK"), which is dropped so
     * the verified local user name ("BEK") is shown.
     */
    private static string ToDisplayName(string name)
    {
        var separator = name.IndexOf('\\');

        if (separator <= 0)
        {
            return name;
        }

        var authority = name[..separator];

        return string.Equals(authority, Environment.MachineName, StringComparison.OrdinalIgnoreCase)
            ? name[(separator + 1)..]
            : name;
    }
}
