using System.Text.Json.Serialization;

namespace BackendApi.Models.Drillholes;

public sealed class DrillholeResponse
{
    [JsonPropertyName("holeId")]
    public string? HoleId { get; init; }

    [JsonPropertyName("projectCode")]
    public string? ProjectCode { get; init; }

    [JsonPropertyName("campaign")]
    public string? Campaign { get; init; }
}
