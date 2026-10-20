using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class LithoCodeResponse
{
    [JsonPropertyName("lithoCode")]
    public string? LithoCode { get; init; }

    [JsonPropertyName("description")]
    public string? Description { get; init; }
}
