using System.Security.Claims;

namespace BackendApi.Auth;

/// <summary>
/// Website access by Active Directory group (Auth:AllowedGroups, e.g.
/// ["BDOM\AcQuire_Uploaders", "BDOM\Bek-Test-Group"]). A member of any one of
/// the groups is allowed. Membership comes from the Windows login token that
/// Negotiate (Kerberos/NTLM) proves: <see cref="ClaimsPrincipal.IsInRole"/> on
/// a WindowsPrincipal resolves DOMAIN\Group names, nested groups included.
/// A user added to a group must sign out of Windows and back in first.
/// See README.md in this folder for the whole flow.
/// </summary>
public static class AllowedGroupAccess
{
    /// <summary>
    /// True when no group is configured (the check is off), or when the user
    /// is authenticated and a member of at least one of <paramref name="groups"/>.
    /// </summary>
    public static bool IsAllowed(ClaimsPrincipal? user, IReadOnlyCollection<string> groups)
    {
        var configured = groups.Where(group => !string.IsNullOrWhiteSpace(group)).ToArray();

        if (configured.Length == 0)
        {
            return true;
        }

        if (user?.Identity is not { IsAuthenticated: true })
        {
            return false;
        }

        return configured.Any(group => IsMember(user, group.Trim()));
    }

    private static bool IsMember(ClaimsPrincipal user, string group)
    {
        try
        {
            return user.IsInRole(group);
        }
        catch (SystemException)
        {
            // Windows could not resolve the group (domain unreachable, broken
            // trust, unknown name): it does not grant access, and the request
            // does not fail with 500. Other groups are still checked.
            return false;
        }
    }
}
