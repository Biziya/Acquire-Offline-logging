using System.Security.Claims;

namespace BackendApi.Controllers;

/// <summary>
/// The calling Windows user, proven by Windows Integrated Authentication
/// (Negotiate: Kerberos or NTLM). Nothing the client sends as a name is used.
/// </summary>
public static class WindowsUser
{
    /// <summary>
    /// The verified user name ("BDOM\jsmith"), or null for an anonymous request.
    /// </summary>
    public static string? GetName(ClaimsPrincipal user) =>
        user.Identity is { IsAuthenticated: true, Name: { Length: > 0 } name }
            ? ToDisplayName(name)
            : null;

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
