using BackendApi.Data;
using BackendApi.Models.RawLithoPage;
using Dapper;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.RawLithoPage.OmFaciesCode;

public sealed class OmFaciesRepository : IOmFaciesRepository
{
    private const string Query = """
        SELECT
            LOOKUP,
            DESCRIPTION
        FROM QV_VS_LOOKUP_RO
        WHERE FIELDNAME = 'OM_Facies';
        """;

    private readonly string _connectionString;

    public OmFaciesRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<IReadOnlyList<OmFaciesCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var command = new CommandDefinition(Query, cancellationToken: cancellationToken);
        var rows = await connection.QueryAsync<LookupRow>(command);

        return rows.Select(Map).ToList();
    }

    private static OmFaciesCodeDto Map(LookupRow row) => new()
    {
        OmFaciesCode = row.Lookup,
        Description = row.Description
    };
}
