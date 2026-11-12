using Microsoft.Data.SqlClient;

namespace BackendApi.Data;

/// <summary>
/// Configuration helpers shared by the data access layer.
/// </summary>
public static class ConfigurationExtensions
{
    public const string DefaultConnectionName = "DefaultConnection";

    // MyApps.CoreDescrData's database, when it differs from DefaultConnection's
    // Initial Catalog (same server; other APIs are unaffected).
    private const string CoreDescrDataDatabaseKey = "CoreDescrData:Database";
    private const string CoreDescrDataWindowsAuthenticationKey = "CoreDescrData:UseWindowsAuthentication";

    // Every database call runs as the request's Windows user (EXECUTE AS
    // LOGIN); see DatabaseConnectionFactory and Sql/WindowsUserImpersonation.sql.
    public const string ImpersonateWindowsUserKey = "Database:ImpersonateWindowsUser";

    /// <summary>True when database calls run as the request's Windows user.</summary>
    public static bool ImpersonatesWindowsUser(this IConfiguration configuration) =>
        configuration.GetValue<bool>(ImpersonateWindowsUserKey);

    // Only members of this Active Directory group (e.g. "BDOM\AcQuire_Uploaders")
    // may use the website; blank turns the check off. See Auth/AllowedGroupAccess.
    public const string AllowedGroupKey = "Auth:AllowedGroup";

    /// <summary>The AD group allowed into the website, or null when the check is off.</summary>
    public static string? GetAllowedGroup(this IConfiguration configuration)
    {
        var group = configuration[AllowedGroupKey]?.Trim();
        return string.IsNullOrEmpty(group) ? null : group;
    }

    /// <summary>
    /// Reads DefaultConnection and fails fast when it is missing.
    /// </summary>
    public static string GetRequiredConnectionString(this IConfiguration configuration) =>
        configuration.GetConnectionString(DefaultConnectionName)
            ?? throw new InvalidOperationException(
                $"Connection string '{DefaultConnectionName}' is not configured.");

    /// <summary>
    /// DefaultConnection pointed at the database holding MyApps.CoreDescrData,
    /// used by Upload Data and Data Viewer. With Windows authentication on, it
    /// connects as the Windows account the API runs under (no password
    /// anywhere) instead of DefaultConnection's SQL login.
    /// </summary>
    public static string GetCoreDescrDataConnectionString(this IConfiguration configuration)
    {
        var builder = new SqlConnectionStringBuilder(configuration.GetRequiredConnectionString());
        var database = configuration[CoreDescrDataDatabaseKey];

        if (!string.IsNullOrWhiteSpace(database))
        {
            builder.InitialCatalog = database;
        }

        if (configuration.GetValue<bool>(CoreDescrDataWindowsAuthenticationKey))
        {
            builder.Remove("User ID");
            builder.Remove("Password");
            builder.IntegratedSecurity = true;
        }

        return builder.ConnectionString;
    }

    /// <summary>
    /// Server, database and login of a connection string, for logs: never the
    /// password or the connection string itself.
    /// </summary>
    public static string DescribeConnection(string connectionString)
    {
        var builder = new SqlConnectionStringBuilder(connectionString);
        var login = builder.IntegratedSecurity
            ? $"Windows authentication as {Environment.UserDomainName}\\{Environment.UserName}"
            : $"SQL login {builder.UserID}";

        return $"{builder.DataSource}/{builder.InitialCatalog}, {login}";
    }
}
