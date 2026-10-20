using System.Text.Json.Serialization;

namespace BackendApi.Models.UploadData;

public sealed class UploadDataRowRequest
{
    [JsonPropertyName("id")]
    public int? Id { get; set; }

    [JsonPropertyName("extractionType")]
    public string? ExtractionType { get; set; }

    [JsonPropertyName("corePass")]
    public string? CorePass { get; set; }

    [JsonPropertyName("recoveryStart")]
    public string? RecoveryStart { get; set; }

    [JsonPropertyName("recoveryEnd")]
    public string? RecoveryEnd { get; set; }

    [JsonPropertyName("coreEnd")]
    public string? CoreEnd { get; set; }

    [JsonPropertyName("lithoFrom")]
    public decimal? LithoFrom { get; set; }

    [JsonPropertyName("lithoTo")]
    public decimal? LithoTo { get; set; }

    [JsonPropertyName("lithoCode")]
    public string? LithoCode { get; set; }

    [JsonPropertyName("colorCode")]
    public string? ColorCode { get; set; }

    [JsonPropertyName("ca")]
    public string? Ca { get; set; }

    [JsonPropertyName("om")]
    public string? Om { get; set; }

    [JsonPropertyName("omFacies")]
    public string? OmFacies { get; set; }

    [JsonPropertyName("py")]
    public string? Py { get; set; }

    [JsonPropertyName("ox")]
    public string? Ox { get; set; }

    [JsonPropertyName("sedim")]
    public string? Sedim { get; set; }

    [JsonPropertyName("redoxCode")]
    public string? RedoxCode { get; set; }

    [JsonPropertyName("granulo")]
    public string? Granulo { get; set; }

    [JsonPropertyName("hardness")]
    public string? Hardness { get; set; }

    [JsonPropertyName("lithologyComments")]
    public string? LithologyComments { get; set; }

    [JsonPropertyName("lithologicalDescription")]
    public string? LithologicalDescription { get; set; }
}
