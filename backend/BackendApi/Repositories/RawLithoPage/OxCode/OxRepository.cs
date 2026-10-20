using BackendApi.Data;
using BackendApi.Models.RawLithoPage;
using Dapper;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.RawLithoPage.OxCode;

public sealed class OxRepository : IOxRepository
{
    private const string Query = """
        SELECT
            LOOKUP,
            DESCRIPTION
        FROM QV_VS_LOOKUP_RO
        WHERE FIELDNAME = 'Min4Qty';
        """;

    private readonly string _connectionString;

    public OxRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<IReadOnlyList<OxCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var command = new CommandDefinition(Query, cancellationToken: cancellationToken);
        var rows = await connection.QueryAsync<LookupRow>(command);

        return rows.Select(Map).ToList();
    }

    private static OxCodeDto Map(LookupRow row) => new()
    {
        OxCode = row.Lookup,
        Description = row.Description
    };
}
