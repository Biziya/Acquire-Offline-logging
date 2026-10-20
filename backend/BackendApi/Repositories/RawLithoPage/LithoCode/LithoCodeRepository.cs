using BackendApi.Data;
using BackendApi.Models.RawLithoPage;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.RawLithoPage.LithoCode;

public sealed class LithoCodeRepository : ILithoCodeRepository
{
    private const string Query = """
        SELECT
            LOOKUP,
            DESCRIPTION
        FROM QV_VS_LOOKUP_RO
        WHERE FIELDNAME = 'LithoFacies';
        """;

    private readonly string _connectionString;

    public LithoCodeRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<IReadOnlyList<LithoCodeResponse>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        var lithoCodes = new List<LithoCodeResponse>();

        await using var connection = new SqlConnection(_connectionString);
        await using var command = new SqlCommand(Query, connection);

        await connection.OpenAsync(cancellationToken);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var lookupOrdinal = reader.GetOrdinal("LOOKUP");
        var descriptionOrdinal = reader.GetOrdinal("DESCRIPTION");

        while (await reader.ReadAsync(cancellationToken))
        {
            lithoCodes.Add(new LithoCodeResponse
            {
                LithoCode = reader.GetNullableString(lookupOrdinal),
                Description = reader.GetNullableString(descriptionOrdinal)
            });
        }

        return lithoCodes;
    }
}
