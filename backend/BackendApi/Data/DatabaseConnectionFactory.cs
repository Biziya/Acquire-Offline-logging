using Microsoft.Data.SqlClient;

namespace BackendApi.Data;

/// <summary>Which configured connection a repository reads or writes through.</summary>
public enum DatabaseTarget
{
    /// <summary>ConnectionStrings:DefaultConnection as configured (lookups, collar list).</summary>
    Default,

    /// <summary>DefaultConnection adjusted by the CoreDescrData section (Upload Data, Data Viewer).</summary>
    CoreDescrData
}

/// <summary>Opens SQL Server connections for the current request.</summary>
public interface IDatabaseConnectionFactory
{
    Task<DatabaseConnection> OpenAsync(DatabaseTarget target, CancellationToken cancellationToken = default);
}

/// <summary>
/// An open connection, running as the request's Windows user when
/// Database:ImpersonateWindowsUser is on. Disposing it reverts the
/// impersonation before the connection goes back to the pool.
/// </summary>
public sealed class DatabaseConnection : IAsyncDisposable
{
    private readonly byte[]? _revertCookie;
    private readonly ILogger _logger;

    internal DatabaseConnection(SqlConnection connection, string? windowsUser, byte[]? revertCookie, ILogger logger)
    {
        Connection = connection;
        WindowsUser = windowsUser;
        _revertCookie = revertCookie;
        _logger = logger;
    }

    public SqlConnection Connection { get; }

    /// <summary>The login SQL Server runs as (EXECUTE AS LOGIN), or null when not impersonating.</summary>
    public string? WindowsUser { get; }

    public async ValueTask DisposeAsync()
    {
        if (_revertCookie is not null && Connection.State == System.Data.ConnectionState.Open)
        {
            try
            {
                // Ad hoc batch (no parameters): REVERT WITH COOKIE only works
                // at the same level as the EXECUTE AS it undoes.
                await using var command = new SqlCommand(
                    $"REVERT WITH COOKIE = 0x{Convert.ToHexString(_revertCookie)};",
                    Connection);
                await command.ExecuteNonQueryAsync(CancellationToken.None);
            }
            catch (Exception exception)
            {
                // Never hand a connection still running as this user to the
                // next request: drop the pool so it is closed, not reused.
                _logger.LogWarning(
                    exception,
                    "REVERT after running as {WindowsUser} failed; clearing the connection pool.",
                    WindowsUser);
                SqlConnection.ClearPool(Connection);
            }
        }

        await Connection.DisposeAsync();
    }
}

/// <summary>
/// The service account connects (connection string as configured). With
/// Database:ImpersonateWindowsUser on, it then runs
/// <c>EXECUTE AS LOGIN = '&lt;DOMAIN\user&gt;'</c> for the user Negotiate
/// verified, so SQL Server checks permissions and reports SUSER_SNAME() as
/// that user. See Sql/WindowsUserImpersonation.sql for the SQL Server setup.
/// </summary>
public sealed class DatabaseConnectionFactory(
    IConfiguration configuration,
    IHttpContextAccessor httpContextAccessor,
    ILogger<DatabaseConnectionFactory> logger) : IDatabaseConnectionFactory
{
    // sysname
    private const int MaxLoginLength = 128;

    public async Task<DatabaseConnection> OpenAsync(
        DatabaseTarget target,
        CancellationToken cancellationToken = default)
    {
        var connectionString = target == DatabaseTarget.CoreDescrData
            ? configuration.GetCoreDescrDataConnectionString()
            : configuration.GetRequiredConnectionString();

        string? windowsUser = null;

        if (configuration.ImpersonatesWindowsUser())
        {
            windowsUser = httpContextAccessor.HttpContext?.User.Identity is { IsAuthenticated: true, Name: { Length: > 0 } name }
                ? name
                : throw new InvalidOperationException(
                    "Database:ImpersonateWindowsUser is on, but the request has no authenticated Windows user.");
        }

        var connection = new SqlConnection(connectionString);

        try
        {
            await connection.OpenAsync(cancellationToken);

            if (windowsUser is null)
            {
                return new DatabaseConnection(connection, null, null, logger);
            }

            await using var command = new SqlCommand(BuildExecuteAsBatch(windowsUser), connection);
            var cookie = await command.ExecuteScalarAsync(cancellationToken) as byte[]
                ?? throw new InvalidOperationException("EXECUTE AS LOGIN returned no revert cookie.");

            return new DatabaseConnection(connection, windowsUser, cookie, logger);
        }
        catch
        {
            // A failed EXECUTE AS leaves the session as the service account;
            // nothing to revert.
            await connection.DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// The ad hoc batch that switches the session to <paramref name="login"/>
    /// and returns the cookie that undoes it. It is not parameterized on
    /// purpose: a parameterized command runs through sp_executesql, and
    /// EXECUTE AS inside it would end with that call. The name comes from
    /// Windows authentication, and is still validated and quoted here.
    /// </summary>
    public static string BuildExecuteAsBatch(string login)
    {
        if (string.IsNullOrWhiteSpace(login)
            || login.Length > MaxLoginLength
            || login.Any(char.IsControl))
        {
            throw new ArgumentException("Not a valid Windows login name.", nameof(login));
        }

        var quoted = login.Replace("'", "''", StringComparison.Ordinal);

        return $"""
            DECLARE @revertCookie varbinary(8000);
            EXECUTE AS LOGIN = N'{quoted}' WITH COOKIE INTO @revertCookie;
            SELECT @revertCookie;
            """;
    }
}
