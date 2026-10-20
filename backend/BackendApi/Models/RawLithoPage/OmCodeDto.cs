using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class OmCodeDto
{
    [JsonPropertyName("omCode")]
    public string? OmCode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
