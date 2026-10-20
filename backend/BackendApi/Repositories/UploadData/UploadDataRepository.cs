using System.Data;
using BackendApi.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.UploadData;

public sealed class UploadDataRepository : IUploadDataRepository
{
    private const string ActionName = "Raw core import_JSON";
    private const string StoredProcedureName = "InsertUpdateCoreDescr_WellCAD";

    private readonly string _connectionString;

    public UploadDataRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task UploadAsync(
        string processedJson,
        CancellationToken cancellationToken = default)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@Action", ActionName, DbType.String);
        parameters.Add("@str_json", processedJson, DbType.String, size: -1);

        await using var connection = new SqlConnection(_connectionString);

        var command = new CommandDefinition(
            StoredProcedureName,
            parameters,
            commandType: CommandType.StoredProcedure,
            cancellationToken: cancellationToken);

        await connection.ExecuteAsync(command);
    }
}
