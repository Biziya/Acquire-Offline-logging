using System.Text.Json.Serialization;

namespace BackendApi.Models.UploadData;

/// <summary>
/// The body of every <c>POST /api/upload-data</c> response, success or failure.
/// </summary>
public sealed class UploadDataResponse
{
    [JsonPropertyName("success")]
    public required bool Success { get; init; }

    [JsonPropertyName("message")]
    public required string Message { get; init; }

    [JsonPropertyName("drillhole")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Drillhole { get; init; }

    [JsonPropertyName("project")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Project { get; init; }

    /// <summary>
    /// The number of JSON interval rows received — not a database row count.
    /// </summary>
    [JsonPropertyName("totalRows")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? TotalRows { get; init; }

    [JsonPropertyName("errors")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? Errors { get; init; }
}
