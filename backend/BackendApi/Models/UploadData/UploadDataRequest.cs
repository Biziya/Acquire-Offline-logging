using System.Text.Json.Serialization;

namespace BackendApi.Models.UploadData;

public sealed class UploadDataRequest
{
    [JsonPropertyName("project")]
    public string? Project { get; set; }

    [JsonPropertyName("campaign")]
    public string? Campaign { get; set; }

    [JsonPropertyName("drillhole")]
    public string? Drillhole { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset? CreatedAt { get; set; }

    [JsonPropertyName("modified_at")]
    public DateTimeOffset? ModifiedAt { get; set; }

    [JsonPropertyName("rows")]
    public List<UploadDataRowRequest?>? Rows { get; set; }
}
