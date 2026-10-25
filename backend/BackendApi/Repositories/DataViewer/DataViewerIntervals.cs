using BackendApi.Models.DataViewer;

namespace BackendApi.Repositories.DataViewer;

/// <summary>
/// CoreDescrData keeps one row per interval AND attribute (NAME / VALUE).
/// This turns them back into Raw Litho rows: the upload procedure's
/// 'Raw core import_JSON' mapping read backwards. Values are copied, never
/// changed or invented.
/// </summary>
public static class DataViewerIntervals
{
    private const string CommentsName = "LithologyComments";

    // Stored NAME → Raw Litho field. omFacies and py are not here: the
    // procedure parses them but does not store them.
    private static readonly Dictionary<string, string> FieldByName = new(StringComparer.OrdinalIgnoreCase)
    {
        ["LithoFacies"] = "lithoCode",
        ["Colour"] = "colorCode",
        ["RedoxFacies"] = "redoxCode",
        ["CA"] = "ca",
        ["OM"] = "om",
        ["OX"] = "ox",
        ["InternalStructure"] = "sedim",
        ["Granulo"] = "granulo",
        ["Hardness"] = "hardness",
        [CommentsName] = "lithologyComments"
    };

    // The procedure matches rows on HOLEID, PROJECTCODE, FROM, TO, PRIORITY,
    // NAME and usr, so rows that share all but NAME are one interval. Uploads
    // under another login or priority stay separate rows. Boxed depths
    // compare by value (5.0m equals 5.00m).
    private readonly record struct IntervalKey(
        string? ProjectCode,
        object? From,
        object? To,
        object? Priority,
        string? Usr);

    /// <summary>
    /// Intervals in the records' order (the repository sorts by FROM, TO), and
    /// how many stored values have no Raw Litho column: another NAME, or a
    /// repeat of one already placed. They are counted, not dropped silently.
    /// </summary>
    public static (IReadOnlyList<DataViewerInterval> Intervals, int HiddenValues) Build(
        IEnumerable<DataViewerRecord> records)
    {
        var intervals = new List<DataViewerInterval>();
        var valuesByKey = new Dictionary<IntervalKey, Dictionary<string, string?>>();
        var hiddenValues = 0;

        foreach (var record in records)
        {
            var key = new IntervalKey(record.ProjectCode, record.From, record.To, record.Priority, record.Usr);

            if (!valuesByKey.TryGetValue(key, out var values))
            {
                values = [];
                valuesByKey.Add(key, values);
                intervals.Add(new DataViewerInterval
                {
                    ProjectCode = record.ProjectCode,
                    LithoFrom = record.From,
                    LithoTo = record.To,
                    Priority = record.Priority,
                    Usr = record.Usr,
                    Values = values
                });
            }

            var name = record.Name?.Trim() ?? "";

            if (!FieldByName.TryGetValue(name, out var field) || !values.TryAdd(field, ValueOf(record, name)))
            {
                hiddenValues++;
            }
        }

        return (intervals, hiddenValues);
    }

    // Comments may be held in COMMENT_VALUE; every other attribute is VALUE.
    private static string? ValueOf(DataViewerRecord record, string name) =>
        string.Equals(name, CommentsName, StringComparison.OrdinalIgnoreCase)
        && !string.IsNullOrEmpty(record.CommentValue)
            ? record.CommentValue
            : record.Value;
}
