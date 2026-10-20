namespace BackendApi.Models.RawLithoData;

public sealed class RawLithologySqlPayload
{
    public required string Project { get; init; }
    public required string Drillhole { get; init; }
    public required List<RawLithologySqlRow> Rows { get; init; }
}

public sealed class RawLithologySqlRow
{
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
}

public sealed record UploadDataSuccessResponse(string Message);

