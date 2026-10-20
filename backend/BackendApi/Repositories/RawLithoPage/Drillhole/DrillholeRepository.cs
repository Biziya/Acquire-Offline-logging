using BackendApi.Data;
using BackendApi.Models.RawLithoPage;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.RawLithoPage.Drillhole;

public sealed class DrillholeRepository : IDrillholeRepository
{
    private const string Query = """
        SELECT
            HOLEID,
            PROJECTCODE,
            RIGHT(PROSPECT, 4) AS CAMPAIGN
        FROM ZOOVCH_COLLAR_LIST;
        """;

    private readonly string _connectionString;

    public DrillholeRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<IReadOnlyList<DrillholeResponse>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        var drillholes = new List<DrillholeResponse>();

        await using var connection = new SqlConnection(_connectionString);
        await using var command = new SqlCommand(Query, connection);

        await connection.OpenAsync(cancellationToken);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var holeIdOrdinal = reader.GetOrdinal("HOLEID");
        var projectCodeOrdinal = reader.GetOrdinal("PROJECTCODE");
        var campaignOrdinal = reader.GetOrdinal("CAMPAIGN");

        while (await reader.ReadAsync(cancellationToken))
        {
            drillholes.Add(new DrillholeResponse
            {
                HoleId = reader.GetNullableString(holeIdOrdinal),
                ProjectCode = reader.GetNullableString(projectCodeOrdinal),
                Campaign = reader.GetNullableString(campaignOrdinal)
            });
        }

        return drillholes;
    }
}
