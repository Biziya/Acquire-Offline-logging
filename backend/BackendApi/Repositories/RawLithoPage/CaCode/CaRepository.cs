using BackendApi.Data;
using BackendApi.Models.RawLithoPage;
using Dapper;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.RawLithoPage.CaCode;

public sealed class CaRepository : ICaRepository
{
    private const string Query = """
        SELECT
            LOOKUP,
            DESCRIPTION
        FROM QV_VS_LOOKUP_RO
        WHERE FIELDNAME = 'Min1Qty';
        """;

    private readonly string _connectionString;

    public CaRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<IReadOnlyList<CaCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var command = new CommandDefinition(Query, cancellationToken: cancellationToken);
        var rows = await connection.QueryAsync<LookupRow>(command);

        return rows.Select(Map).ToList();
    }

    private static CaCodeDto Map(LookupRow row) => new()
    {
        CaCode = row.Lookup,
        Description = row.Description
    };
}
