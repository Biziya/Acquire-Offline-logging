using BackendApi.Data;
using BackendApi.Models.TableConstants;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.TableConstants;

/// <summary>One row of QV_VS_LOOKUP_RO.</summary>
public sealed record LookupRow(string? FieldName, string? Lookup, string? Description);

public sealed class TableConstantsRepository : ITableConstantsRepository
{
    // The FIELDNAMEs the nine former lookup endpoints queried, one each.
    private const string Query = """
        SELECT
            FIELDNAME,
            LOOKUP,
            DESCRIPTION
        FROM QV_VS_LOOKUP_RO
        WHERE FIELDNAME IN (
            'Min1Qty', 'Colour', 'LithoFacies', 'Min2Qty', 'OM_Facies',
            'Min4Qty', 'Min3Qty', 'RedoxFacies', 'InternalStructure');
        """;

    private readonly string _connectionString;

    public TableConstantsRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<TableConstantsResponse> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        var rows = new List<LookupRow>();

        await using var connection = new SqlConnection(_connectionString);
        await using var command = new SqlCommand(Query, connection);

        await connection.OpenAsync(cancellationToken);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var fieldNameOrdinal = reader.GetOrdinal("FIELDNAME");
        var lookupOrdinal = reader.GetOrdinal("LOOKUP");
        var descriptionOrdinal = reader.GetOrdinal("DESCRIPTION");

        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new LookupRow(
                reader.GetNullableString(fieldNameOrdinal),
                reader.GetNullableString(lookupOrdinal),
                reader.GetNullableString(descriptionOrdinal)));
        }

        return Group(rows);
    }

    /// <summary>
    /// Sorts lookup rows into their lists, keeping the database order within
    /// each list. FIELDNAME is matched case-insensitively, as SQL Server did.
    /// </summary>
    public static TableConstantsResponse Group(IEnumerable<LookupRow> rows)
    {
        var response = new TableConstantsResponse();

        foreach (var row in rows)
        {
            switch (row.FieldName?.ToUpperInvariant())
            {
                case "MIN1QTY": response.CaCode.Add(new(row.Lookup, row.Description)); break;
                case "COLOUR": response.ColourCode.Add(new(row.Lookup, row.Description)); break;
                case "LITHOFACIES": response.LithoCode.Add(new(row.Lookup, row.Description)); break;
                case "MIN2QTY": response.OmCode.Add(new(row.Lookup, row.Description)); break;
                case "OM_FACIES": response.OmFaciesCode.Add(new(row.Lookup, row.Description)); break;
                case "MIN4QTY": response.OxCode.Add(new(row.Lookup, row.Description)); break;
                case "MIN3QTY": response.PyCode.Add(new(row.Lookup, row.Description)); break;
                case "REDOXFACIES": response.RedoxCode.Add(new(row.Lookup, row.Description)); break;
                case "INTERNALSTRUCTURE": response.SedimCode.Add(new(row.Lookup, row.Description)); break;
            }
        }

        return response;
    }
}
