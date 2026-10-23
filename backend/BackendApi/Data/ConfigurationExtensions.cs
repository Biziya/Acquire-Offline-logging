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

    /// <summary>
    /// Reads a named connection string and fails fast when it is missing.
    /// </summary>
    public static string GetRequiredConnectionString(
        this IConfiguration configuration,
        string name = DefaultConnectionName) =>
        configuration.GetConnectionString(name)
            ?? throw new InvalidOperationException(
                $"Connection string '{name}' is not configured.");

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
}
