using BackendApi.Data;
using BackendApi.Models.RawLithoPage;
using Microsoft.Data.SqlClient;

namespace BackendApi.Repositories.RawLithoPage.ColourCode;

public sealed class ColourRepository : IColourRepository
{
    private const string Query = """
        SELECT
            LOOKUP,
            DESCRIPTION
        FROM QV_VS_LOOKUP_RO
        WHERE FIELDNAME = 'Colour';
        """;

    private readonly string _connectionString;

    public ColourRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetRequiredConnectionString();
    }

    public async Task<IReadOnlyList<ColourCodeResponse>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        var colours = new List<ColourCodeResponse>();

        await using var connection = new SqlConnection(_connectionString);
        await using var command = new SqlCommand(Query, connection);

        await connection.OpenAsync(cancellationToken);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var lookupOrdinal = reader.GetOrdinal("LOOKUP");
        var descriptionOrdinal = reader.GetOrdinal("DESCRIPTION");

        while (await reader.ReadAsync(cancellationToken))
        {
            colours.Add(new ColourCodeResponse
            {
                ColourCode = reader.GetNullableString(lookupOrdinal),
                Description = reader.GetNullableString(descriptionOrdinal)
            });
        }

        return colours;
    }
}
