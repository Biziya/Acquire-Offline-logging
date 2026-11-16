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
    /// With a <paramref name="logger"/>, a refusal and any group Windows cannot
    /// resolve (wrong name, e.g. a local server group written as BDOM\…) are
    /// logged as warnings.
    /// </summary>
    public static bool IsAllowed(
        ClaimsPrincipal? user,
        IReadOnlyCollection<string> groups,
        ILogger? logger = null)
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

        if (configured.Any(group => IsMember(user, group.Trim(), logger)))
        {
            return true;
        }

        logger?.LogWarning(
            "{User} is not in any allowed group ({AllowedGroups}).",
            user.Identity.Name,
            string.Join(", ", configured));

        return false;
    }

    private static bool IsMember(ClaimsPrincipal user, string group, ILogger? logger)
    {
        try
        {
            return user.IsInRole(group);
        }
        catch (SystemException exception)
        {
            // Windows could not resolve the group (domain unreachable, broken
            // trust, unknown name): it does not grant access, and the request
            // does not fail with 500. Other groups are still checked.
            logger?.LogWarning(
                "Group {Group} could not be resolved by Windows ({Error}). Check its name and domain.",
                group,
                exception.Message);
            return false;
        }
    }
}
