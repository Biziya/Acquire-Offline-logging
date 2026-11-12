using System.Security.Claims;

namespace BackendApi.Auth;

/// <summary>
/// Website access by Active Directory group (Auth:AllowedGroup, e.g.
/// "BDOM\AcQuire_Uploaders"). Membership comes from the Windows login token
/// that Negotiate (Kerberos/NTLM) proves: <see cref="ClaimsPrincipal.IsInRole"/>
/// on a WindowsPrincipal resolves DOMAIN\Group names, nested groups included.
/// A user added to the group must sign out of Windows and back in first.
/// </summary>
public static class AllowedGroupAccess
{
    /// <summary>
    /// True when no group is configured (the check is off), or when the user
    /// is authenticated and a member of <paramref name="group"/>.
    /// </summary>
    public static bool IsAllowed(ClaimsPrincipal? user, string? group)
    {
        if (string.IsNullOrWhiteSpace(group))
        {
            return true;
        }

        if (user?.Identity is not { IsAuthenticated: true })
        {
            return false;
        }

        try
        {
            return user.IsInRole(group.Trim());
        }
        catch (SystemException)
        {
            // Windows could not resolve the group (domain unreachable, broken
            // trust): refuse access rather than fail the request with 500.
            return false;
        }
    }
}
