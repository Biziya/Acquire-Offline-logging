using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class OmFaciesCodeDto
{
    [JsonPropertyName("omFaciesCode")]
    public string? OmFaciesCode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
