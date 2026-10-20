using BackendApi.Data;
using BackendApi.Models.RawLithoPage;
using Dapper;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.RawLithoPage.SedimCode;

public sealed class SedimRepository : ISedimRepository
{
    private const string Query = """
        SELECT
            LOOKUP,
            DESCRIPTION
        FROM QV_VS_LOOKUP_RO
        WHERE FIELDNAME = 'InternalStructure';
        """;

    private readonly string _connectionString;

    public SedimRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<IReadOnlyList<SedimCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var command = new CommandDefinition(Query, cancellationToken: cancellationToken);
        var rows = await connection.QueryAsync<LookupRow>(command);

        return rows.Select(Map).ToList();
    }

    private static SedimCodeDto Map(LookupRow row) => new()
    {
        SedimCode = row.Lookup,
        Description = row.Description
    };
}
