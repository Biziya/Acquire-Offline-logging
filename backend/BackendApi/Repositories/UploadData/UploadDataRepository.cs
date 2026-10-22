using System.Data;
using BackendApi.Data;
using BackendApi.Models.UploadData;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.UploadData;

public sealed class UploadDataRepository : IUploadDataRepository
{
    private const string StoredProcedureName = "dbo.InsertUpdateCoreDescr_WellCAD";
    private const string ActionName = "Raw core import_JSON";

    // Sizes of the procedure's parameters: @Hole varchar(20), @usr and
    // @fileName varchar(50). The controller rejects longer values, so nothing
    // is silently truncated here.
    public const int HoleSize = 20;
    public const int UserSize = 50;
    public const int FileNameSize = 50;

    // A whole drillhole is one call; allow more than the 30 s default.
    private const int CommandTimeoutSeconds = 120;

    private readonly string _connectionString;

    public UploadDataRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task UploadAsync(
        UploadDataRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await using var command = new SqlCommand(StoredProcedureName, connection)
        {
            CommandType = CommandType.StoredProcedure,
            CommandTimeout = CommandTimeoutSeconds
        };

        command.Parameters.Add("@Action", SqlDbType.VarChar, 50).Value = ActionName;
        command.Parameters.Add("@Hole", SqlDbType.VarChar, HoleSize).Value = request.Drillhole;
        command.Parameters.Add("@usr", SqlDbType.VarChar, UserSize).Value =
            (object?)request.UserName ?? DBNull.Value;
        command.Parameters.Add("@fileName", SqlDbType.VarChar, FileNameSize).Value = request.FileName;
        command.Parameters.Add("@str_json", SqlDbType.NVarChar, -1).Value = request.Json;

        await connection.OpenAsync(cancellationToken);

        // The procedure's result sets carry no counts the API reports, but each
        // one is read so an error raised after the first statement still
        // surfaces as an exception instead of being lost with the reader.
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        do
        {
            while (await reader.ReadAsync(cancellationToken))
            {
            }
        }
        while (await reader.NextResultAsync(cancellationToken));
    }
}
