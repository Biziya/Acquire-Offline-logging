using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class SedimCodeDto
{
    [JsonPropertyName("sedimCode")]
    public string? SedimCode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
