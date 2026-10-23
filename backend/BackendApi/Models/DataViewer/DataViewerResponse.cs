namespace BackendApi.Models.DataViewer;

/// <summary>
/// The stored CoreDescrData rows of one drillhole, with its Project and
/// Campaign from the drillhole list. Project / Campaign are null when the
/// drillhole list has no single match; they are never guessed.
/// </summary>
public sealed class DataViewerResponse
{
    public required string Drillhole { get; init; }
    public string? Project { get; init; }
    public string? Campaign { get; init; }
    public int TotalRecords => Records.Count;
    public required IReadOnlyList<DataViewerRecord> Records { get; init; }
}

/// <summary>
/// One MyApps.CoreDescrData row, values as stored. Numeric and date columns
/// keep their SQL type (a number stays a number, a date an ISO date); NULL
/// stays null.
/// </summary>
public sealed class DataViewerRecord
{
    public string? HoleId { get; init; }
    public string? ProjectCode { get; init; }
    public object? From { get; init; }
    public object? To { get; init; }
    public object? Priority { get; init; }
    public string? Name { get; init; }
    public string? Value { get; init; }
    public string? CommentValue { get; init; }
    public object? ConsistentCheck { get; init; }
    public string? Usr { get; init; }
    public string? FileName { get; init; }
    public string? PathName { get; init; }
    public object? CreatedAt { get; init; }
    public object? ModifiedAt { get; init; }
    public string? ImportedBy { get; init; }
}
