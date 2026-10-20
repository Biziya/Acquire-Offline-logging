using System.Text.Json.Serialization;

namespace BackendApi.Models.RawLithoData;

public sealed class RawLithologyUploadRequest
{
    public string? Project { get; init; }
    public string? Campaign { get; init; }
    public string? Drillhole { get; init; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset? CreatedAt { get; init; }

    [JsonPropertyName("modified_at")]
    public DateTimeOffset? ModifiedAt { get; init; }

    public List<RawLithologyUploadRow>? Rows { get; init; }
}

public sealed class RawLithologyUploadRow
{
    public int? Id { get; init; }
    public string? ExtractionType { get; init; }
    public string? CorePass { get; init; }
    public string? RecoveryStart { get; init; }
    public string? RecoveryEnd { get; init; }
    public string? CoreEnd { get; init; }
    public decimal? LithoFrom { get; init; }
    public decimal? LithoTo { get; init; }
    public string? LithoCode { get; init; }
    public string? ColorCode { get; init; }
    public string? Ca { get; init; }
    public string? Om { get; init; }
    public string? OmFacies { get; init; }
    public string? Py { get; init; }
    public string? Ox { get; init; }
    public string? Sedim { get; init; }
    public string? RedoxCode { get; init; }
    public string? Granulo { get; init; }
    public string? Hardness { get; init; }
    public string? LithologyComments { get; init; }
    public string? LithologicalDescription { get; init; }
}

