using Microsoft.Data.SqlClient;

namespace BackendApi.Data;

/// <summary>
/// Reader helpers shared by the repositories that map results manually.
/// </summary>
public static class SqlDataReaderExtensions
{
    /// <summary>
    /// Reads a column as a string, returning <c>null</c> for database nulls.
    /// </summary>
    public static string? GetNullableString(this SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : Convert.ToString(reader.GetValue(ordinal));
}
