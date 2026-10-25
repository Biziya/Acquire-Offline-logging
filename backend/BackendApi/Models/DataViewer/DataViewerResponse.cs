namespace BackendApi.Models.DataViewer;

/// <summary>
/// The stored lithology of one drillhole, one entry per interval like the Raw
/// Litho table. Project comes from the stored rows' PROJECTCODE, Campaign
/// from the drillhole list for the same HOLEID and PROJECTCODE. Both are null
/// when there is not exactly one; they are never guessed.
/// </summary>
public sealed class DataViewerResponse
{
    public required string Drillhole { get; init; }
    public string? Project { get; init; }
    public string? Campaign { get; init; }

    /// <summary>Every PROJECTCODE stored for the drillhole, with its Campaign.</summary>
    public required IReadOnlyList<DataViewerProject> Projects { get; init; }

    public int TotalIntervals => Intervals.Count;

    /// <summary>CoreDescrData rows read (one per interval and NAME).</summary>
    public required int TotalRecords { get; init; }

    /// <summary>Stored rows with no Raw Litho column (another NAME, or a repeat).</summary>
    public required int HiddenValues { get; init; }

    /// <summary>Distinct usr / FileName of the stored rows.</summary>
    public required IReadOnlyList<string> StoredBy { get; init; }
    public required IReadOnlyList<string> FileNames { get; init; }

    public required IReadOnlyList<DataViewerInterval> Intervals { get; init; }
}

public sealed class DataViewerProject
{
    public required string ProjectCode { get; init; }
    public string? Campaign { get; init; }
}

/// <summary>
/// One interval: the CoreDescrData rows sharing PROJECTCODE, FROM, TO,
/// PRIORITY and usr. Depths keep their SQL type (no rounding). Values are
/// keyed by the Raw Litho field (lithoCode, colorCode, …); an attribute that
/// is not stored is absent, never filled in.
/// </summary>
public sealed class DataViewerInterval
{
    public string? ProjectCode { get; init; }
    public object? LithoFrom { get; init; }
    public object? LithoTo { get; init; }
    public object? Priority { get; init; }
    public string? Usr { get; init; }
    public required IReadOnlyDictionary<string, string?> Values { get; init; }
}

/// <summary>
/// One MyApps.CoreDescrData row, values as stored. Numeric columns keep their
/// SQL type; NULL stays null. Read by the repository, not returned as is.
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
}
