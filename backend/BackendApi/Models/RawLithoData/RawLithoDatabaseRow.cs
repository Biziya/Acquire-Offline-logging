using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoData;

internal sealed class RawLithoDatabaseRow
{
    [JsonPropertyName("lithoFrom")]
    public required string LithoFrom { get; init; }

    [JsonPropertyName("lithoTo")]
    public required string LithoTo { get; init; }

    [JsonPropertyName("lithoCode")]
    public required string LithoCode { get; init; }

    [JsonPropertyName("colorCode")]
    public required string ColorCode { get; init; }

    [JsonPropertyName("ca")]
    public required string Ca { get; init; }

    [JsonPropertyName("om")]
    public required string Om { get; init; }

    [JsonPropertyName("omFacies")]
    public required string OmFacies { get; init; }

    [JsonPropertyName("py")]
    public required string Py { get; init; }

    [JsonPropertyName("ox")]
    public required string Ox { get; init; }

    [JsonPropertyName("sedim")]
    public required string Sedim { get; init; }

    [JsonPropertyName("redoxCode")]
    public required string RedoxCode { get; init; }

    [JsonPropertyName("granulo")]
    public required string Granulo { get; init; }

    [JsonPropertyName("hardness")]
    public required string Hardness { get; init; }

    [JsonPropertyName("lithologyComments")]
    public required string LithologyComments { get; init; }
}
