using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoPage;

public sealed class PyCodeDto
{
    [JsonPropertyName("pyCode")]
    public string? PyCode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
