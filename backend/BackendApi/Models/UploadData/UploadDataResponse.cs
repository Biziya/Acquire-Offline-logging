using System.Text.Json.Serialization;

namespace BackendApi.Models.UploadData;

public sealed class UploadDataResponse
{
    [JsonPropertyName("success")]
    public required bool Success { get; init; }

    [JsonPropertyName("message")]
    public required string Message { get; init; }

    [JsonPropertyName("drillhole")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Drillhole { get; init; }

    [JsonPropertyName("rowsSubmitted")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? RowsSubmitted { get; init; }
}
