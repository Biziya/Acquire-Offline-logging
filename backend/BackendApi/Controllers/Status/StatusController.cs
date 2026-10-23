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
    /// calling Windows user, proven by Windows Integrated Authentication
    /// (Negotiate: Kerberos or NTLM); the browser is challenged for it, and
    /// nothing the client sends as a name is used. Without it the endpoint is
    /// anonymous, as before.
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

        if (User.Identity is not { IsAuthenticated: true, Name: { Length: > 0 } name })
        {
            // 401 + WWW-Authenticate: Negotiate; browsers then authenticate
            // automatically for localhost / Local intranet sites.
            return Challenge(NegotiateDefaults.AuthenticationScheme);
        }

        return Ok(new StatusResponse(Online, Message, ToDisplayName(name)));
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
