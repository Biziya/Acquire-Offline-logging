using Microsoft.Data.SqlClient;

namespace BackendApi.Data;

/// <summary>
/// SQL Server errors meaning "this account may not do that". When the API
/// runs as the Windows user, they are the user's own permissions.
/// </summary>
public static class DatabaseAccessErrors
{
    // 229 / 230: permission denied on an object / a column.
    // 916: the login cannot access the database.
    // 15406: cannot EXECUTE AS the login (it has no SQL Server access, or the
    //        service account lacks IMPERSONATE on it).
    // 15517: cannot execute as the database principal.
    private static readonly HashSet<int> Numbers = [229, 230, 916, 15406, 15517];

    /// <summary>The first access-denied error in the exception chain, if any.</summary>
    public static SqlError? Find(Exception? exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is SqlException sqlException
                && sqlException.Errors.Cast<SqlError>().FirstOrDefault(error => Numbers.Contains(error.Number)) is { } error)
            {
                return error;
            }
        }

        return null;
    }
}
