using BackendApi.Data;
using BackendApi.Models.RawLithoPage;
using Dapper;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.RawLithoPage.RedoxCode;

public sealed class RedoxCodeRepository : IRedoxCodeRepository
{
    private const string Query = """
        SELECT
            LOOKUP,
            DESCRIPTION
        FROM QV_VS_LOOKUP_RO
        WHERE FIELDNAME = 'RedoxFacies';
        """;

    private readonly string _connectionString;

    public RedoxCodeRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<IReadOnlyList<RedoxCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var command = new CommandDefinition(Query, cancellationToken: cancellationToken);
        var rows = await connection.QueryAsync<LookupRow>(command);

        return rows.Select(Map).ToList();
    }

    private static RedoxCodeDto Map(LookupRow row) => new()
    {
        RedoxCode = row.Lookup,
        Description = row.Description
    };
}
