using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class CaCodeDto
{
    [JsonPropertyName("caCode")]
    public string? CaCode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
