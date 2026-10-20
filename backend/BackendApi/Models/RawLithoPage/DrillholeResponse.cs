using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class DrillholeResponse
{
    [JsonPropertyName("holeId")]
    public string? HoleId { get; init; }

    [JsonPropertyName("projectCode")]
    public string? ProjectCode { get; init; }

    [JsonPropertyName("campaign")]
    public string? Campaign { get; init; }
}
