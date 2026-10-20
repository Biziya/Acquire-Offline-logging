using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class RedoxCodeDto
{
    [JsonPropertyName("redoxCode")]
    public string? RedoxCode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
