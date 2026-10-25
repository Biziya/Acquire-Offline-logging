using System.Data;
using BackendApi.Data;
using BackendApi.Models.DataViewer;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.DataViewer;

public sealed class DataViewerRepository : IDataViewerRepository
{
    // HOLEID is written through @Hole varchar(20), so no stored value is longer.
    public const int HoleIdSize = 20;

    private const string HoleIdsQuery = """
        SELECT DISTINCT [HOLEID]
        FROM [MyApps].[CoreDescrData]
        WHERE [HOLEID] IS NOT NULL
          AND LTRIM(RTRIM([HOLEID])) <> ''
        ORDER BY [HOLEID];
        """;

    // Only the table's own columns; the interval order is FROM, TO, then the
    // rest of the grouping key so each interval's rows are read together.
    private const string RecordsQuery = """
        SELECT
            [HOLEID],
            [PROJECTCODE],
            [FROM],
            [TO],
            [PRIORITY],
            [NAME],
            [VALUE],
            [COMMENT_VALUE],
            [CONSISTENTCHECK],
            [usr],
            [FileName],
            [PathName]
        FROM [MyApps].[CoreDescrData]
        WHERE [HOLEID] = @Drillhole
        ORDER BY [FROM], [TO], [PRIORITY], [PROJECTCODE], [usr], [NAME];
        """;

    private readonly string _connectionString;

    public DataViewerRepository(IConfiguration configuration)
    {
        // The same database and login as Upload Data (CoreDescrData section).
        _connectionString = configuration.GetCoreDescrDataConnectionString();
    }

    public async Task<IReadOnlyList<string>> GetHoleIdsAsync(CancellationToken cancellationToken = default)
    {
        var holeIds = new List<string>();

        await using var connection = new SqlConnection(_connectionString);
        await using var command = new SqlCommand(HoleIdsQuery, connection);

        await connection.OpenAsync(cancellationToken);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            holeIds.Add(reader.GetNullableString(0)!);
        }

        return holeIds;
    }

    public async Task<IReadOnlyList<DataViewerRecord>> GetByHoleIdAsync(
        string holeId,
        CancellationToken cancellationToken = default)
    {
        var records = new List<DataViewerRecord>();

        await using var connection = new SqlConnection(_connectionString);
        await using var command = new SqlCommand(RecordsQuery, connection);
        command.Parameters.Add("@Drillhole", SqlDbType.VarChar, HoleIdSize).Value = holeId;

        await connection.OpenAsync(cancellationToken);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            records.Add(new DataViewerRecord
            {
                HoleId = reader.GetNullableString(0),
                ProjectCode = reader.GetNullableString(1),
                From = reader.GetNullableValue(2),
                To = reader.GetNullableValue(3),
                Priority = reader.GetNullableValue(4),
                Name = reader.GetNullableString(5),
                Value = reader.GetNullableString(6),
                CommentValue = reader.GetNullableString(7),
                ConsistentCheck = reader.GetNullableValue(8),
                Usr = reader.GetNullableString(9),
                FileName = reader.GetNullableString(10),
                PathName = reader.GetNullableString(11)
            });
        }

        return records;
    }
}
