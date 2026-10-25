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
    private readonly string _database;
    private readonly ILogger<UploadDataRepository> _logger;

    public UploadDataRepository(
        IConfiguration configuration,
        ILogger<UploadDataRepository> logger)
    {
        // The CoreDescrData section's database and login (see ConfigurationExtensions).
        _connectionString = configuration.GetCoreDescrDataConnectionString();
        _database = new SqlConnectionStringBuilder(_connectionString).InitialCatalog;
        _logger = logger;
    }

    public async Task UploadAsync(
        UploadDataRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        // Never write anywhere but the configured database.
        if (!string.Equals(connection.Database, _database, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Connected to database '{connection.Database}' instead of '{_database}'.");
        }

        // Like the SSMS test: BEGIN TRAN, EXEC, COMMIT — or ROLLBACK on error.
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            await LogIdentityAsync(connection, transaction, request, cancellationToken);

            await using (var command = new SqlCommand(StoredProcedureName, connection, transaction)
            {
                CommandType = CommandType.StoredProcedure,
                CommandTimeout = CommandTimeoutSeconds
            })
            {
                command.Parameters.Add("@Action", SqlDbType.VarChar, 50).Value = ActionName;
                command.Parameters.Add("@Hole", SqlDbType.VarChar, HoleSize).Value = request.Drillhole;
                // The verified Windows user. Stored in usr only once the
                // procedure stops replacing @usr with SUSER_NAME() (the SQL
                // login); see Sql/UploadDataUser.sql.
                command.Parameters.Add("@usr", SqlDbType.VarChar, UserSize).Value = request.UserName;
                command.Parameters.Add("@fileName", SqlDbType.VarChar, FileNameSize).Value = request.FileName;
                command.Parameters.Add("@str_json", SqlDbType.NVarChar, -1).Value = request.Json;

                // The procedure's result sets carry no counts the API reports,
                // but each one is read so an error raised after the first
                // statement still surfaces here, before anything is committed.
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);

                do
                {
                    while (await reader.ReadAsync(cancellationToken))
                    {
                    }
                }
                while (await reader.NextResultAsync(cancellationToken));
            }

            // Not cancellable: once the procedure has finished, a client
            // disconnect must not leave the outcome unknown.
            await transaction.CommitAsync(CancellationToken.None);
        }
        catch (Exception exception)
        {
            // The procedure runs with XACT_ABORT ON, so SQL Server may already
            // have rolled back; then the transaction has no connection left.
            if (transaction.Connection is not null)
            {
                try
                {
                    await transaction.RollbackAsync(CancellationToken.None);
                }
                catch (Exception rollbackException)
                {
                    _logger.LogWarning(
                        rollbackException,
                        "Rollback after a failed upload of drillhole {Drillhole} also failed.",
                        request.Drillhole);
                }
            }

            _logger.LogWarning(
                exception,
                "Upload of drillhole {Drillhole} to {Server}/{Database} was rolled back.",
                request.Drillhole,
                connection.DataSource,
                _database);

            throw;
        }
    }

    // Records which database and SQL identity the procedure really runs under,
    // next to the Windows user it uploads for.
    private async Task LogIdentityAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        UploadDataRequest request,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "SELECT DB_NAME(), SUSER_SNAME(), USER_NAME();",
            connection,
            transaction);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        if (await reader.ReadAsync(cancellationToken))
        {
            _logger.LogInformation(
                "Uploading drillhole {Drillhole} for {WindowsUser} to {Server}/{Database} as SQL login {SqlLogin} (database user {DatabaseUser}).",
                request.Drillhole,
                request.UserName,
                connection.DataSource,
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2));
        }
    }
}
