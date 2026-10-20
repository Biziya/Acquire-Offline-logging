using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class OxCodeDto
{
    [JsonPropertyName("oxCode")]
    public string? OxCode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
