using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class ColourCodeResponse
{
    [JsonPropertyName("colourCode")]
    public string? ColourCode { get; init; }

    [JsonPropertyName("description")]
    public string? Description { get; init; }
}
