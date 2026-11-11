using System.Data;
using BackendApi.Data;
using BackendApi.Models.Drillholes;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.Drillholes;

public sealed class DrillholeRepository : IDrillholeRepository
{
    // Project and Campaign of every drillhole; Data Viewer reuses it per HOLEID.
    private const string SelectDrillholes = """
        SELECT
            HOLEID,
            PROJECTCODE,
            RIGHT(PROSPECT, 4) AS CAMPAIGN
        FROM ZOOVCH_COLLAR_LIST
        """;

    private readonly IDatabaseConnectionFactory _connections;

    public DrillholeRepository(IDatabaseConnectionFactory connections)
    {
        _connections = connections;
    }

    public Task<IReadOnlyList<DrillholeResponse>> GetAllAsync(
        CancellationToken cancellationToken = default) =>
        ReadAsync(SelectDrillholes + ";", holeId: null, cancellationToken);

    public Task<IReadOnlyList<DrillholeResponse>> GetByHoleIdAsync(
        string holeId,
        CancellationToken cancellationToken = default) =>
        ReadAsync(SelectDrillholes + " WHERE HOLEID = @HoleId;", holeId, cancellationToken);

    private async Task<IReadOnlyList<DrillholeResponse>> ReadAsync(
        string query,
        string? holeId,
        CancellationToken cancellationToken)
    {
        var drillholes = new List<DrillholeResponse>();

        await using var database = await _connections.OpenAsync(DatabaseTarget.Default, cancellationToken);
        await using var command = new SqlCommand(query, database.Connection);

        if (holeId is not null)
        {
            command.Parameters.Add("@HoleId", SqlDbType.NVarChar, 50).Value = holeId;
        }

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
