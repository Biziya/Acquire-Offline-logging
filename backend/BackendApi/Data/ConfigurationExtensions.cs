namespace BackendApi.Data;

/// <summary>
/// Configuration helpers shared by the data access layer.
/// </summary>
public static class ConfigurationExtensions
{
    public const string DefaultConnectionName = "DefaultConnection";

    /// <summary>
    /// Reads a named connection string and fails fast when it is missing.
    /// </summary>
    public static string GetRequiredConnectionString(
        this IConfiguration configuration,
        string name = DefaultConnectionName) =>
        configuration.GetConnectionString(name)
            ?? throw new InvalidOperationException(
                $"Connection string '{name}' is not configured.");
}
