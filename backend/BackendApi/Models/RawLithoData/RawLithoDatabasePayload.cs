using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoData;

internal sealed class RawLithoDatabasePayload
{
    [JsonPropertyName("project")]
    public required string Project { get; init; }

    [JsonPropertyName("drillhole")]
    public required string Drillhole { get; init; }

    [JsonPropertyName("rows")]
    public required IReadOnlyList<RawLithoDatabaseRow> Rows { get; init; }
}
