using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using BackendApi.Repositories.UploadData;

namespace BackendApi.Controllers.UploadData;

/// <summary>
/// Checks an uploaded lithology document and, when it is valid, builds the
/// smaller JSON the stored procedure reads: only the fields its
/// "Raw core import_JSON" branch stores, with their original names and values.
/// The uploaded text itself is never changed.
/// </summary>
/// <remarks>
/// Rules, all reported together (up to <see cref="MaxReportedErrors"/>):
/// project ≤ 10 characters and drillhole ≤ 20 (the procedure's varchar sizes);
/// each row's lithoFrom/lithoTo present, numeric, not negative, at most two
/// decimals (the procedure rounds to two) and From &lt; To; across the file no
/// two intervals overlap or repeat (touching, e.g. 0–5 and 5–10, is fine);
/// text attributes are text, codes ≤ 20 characters, lithologyComments ≤ 254;
/// lookup codes are in their QV_VS_LOOKUP_RO list, or empty.
/// </remarks>
public static class UploadDataValidator
{
    // Longer lists are cut here with a "…and N more" line.
    public const int MaxReportedErrors = 50;

    // Sizes the procedure stores text in: varchar(10) for the project,
    // varchar(20) for each code and varchar(254) for the comments.
    public const int ProjectSize = 10;
    public const int CodeSize = 20;
    public const int CommentsSize = 254;

    // The procedure stores depths rounded to this many decimals.
    private const int DepthDecimals = 2;

    // Plain decimals such as "5", "12.75" or "-0.5": no exponent, no
    // thousands separator, so SQL Server can convert the same value. A sign
    // is parsed so "-0.5" is reported as negative rather than "not a number".
    private const NumberStyles DepthStyle =
        NumberStyles.AllowLeadingWhite |
        NumberStyles.AllowTrailingWhite |
        NumberStyles.AllowLeadingSign |
        NumberStyles.AllowDecimalPoint;

    private const string CommentsField = "lithologyComments";

    // Row attributes the procedure stores, in the order they are written.
    // Each may be missing, null or "" (empty is valid), but not a non-text
    // value. Everything else in a row (id, extractionType, corePass, recovery
    // fields, coreEnd, lithologicalDescription, …) is dropped.
    private static readonly string[] StoredTextFields =
    [
        "lithoCode", "colorCode", "redoxCode", "ca", "om", "omFacies", "py", "ox",
        "sedim", "granulo", "hardness", CommentsField
    ];

    // Every text attribute checked: the stored ones plus any lookup field
    // that is not stored (none today), which must still be valid.
    private static readonly string[] CheckedTextFields =
        [.. StoredTextFields, .. UploadLookups.Fields.Except(StoredTextFields)];

    // The payload goes to SQL Server, not into HTML: keep non-ASCII text and
    // characters such as '+' readable instead of \u-escaping them.
    private static readonly JsonWriterOptions PayloadOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    /// <param name="StoredProcedureJson">
    /// The filtered document for <c>@str_json</c>; empty when there are errors.
    /// </param>
    public sealed record Result(
        string Project,
        string Drillhole,
        int TotalRows,
        string StoredProcedureJson,
        IReadOnlyList<string> Errors);

    private sealed record Depths(decimal From, decimal To);

    private sealed record Interval(int Row, decimal From, decimal To);

    /// <summary>
    /// Validates the document structure, every row and the intervals across
    /// rows, then builds the stored procedure payload.
    /// </summary>
    /// <param name="lookups">The codes each lookup field may hold.</param>
    /// <exception cref="JsonException">The text is not valid JSON.</exception>
    public static Result Validate(string json, UploadLookups lookups)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        if (root.ValueKind != JsonValueKind.Object)
        {
            return new Result("", "", 0, "", ["The JSON root must be an object."]);
        }

        var errors = new List<string>();
        var project = ReadRequiredText(root, "project", errors);
        var drillhole = ReadRequiredText(root, "drillhole", errors);

        if (project.Length > ProjectSize)
        {
            errors.Add($"project must be {ProjectSize} characters or fewer.");
        }

        if (drillhole.Length > UploadDataRepository.HoleSize)
        {
            errors.Add(
                $"drillhole must be {UploadDataRepository.HoleSize} characters or fewer.");
        }

        var depths = new List<Depths>();

        if (!root.TryGetProperty("rows", out var rows) ||
            rows.ValueKind != JsonValueKind.Array)
        {
            errors.Add("rows is required and must be an array.");
        }
        else if (rows.GetArrayLength() == 0)
        {
            errors.Add("rows must contain at least one record.");
        }
        else
        {
            var intervals = new List<Interval>();
            var rowNumber = 0;

            foreach (var row in rows.EnumerateArray())
            {
                var (interval, rowIsValid) = ValidateRow(row, ++rowNumber, lookups, errors);

                if (interval is not null)
                {
                    intervals.Add(interval);

                    if (rowIsValid)
                    {
                        depths.Add(new Depths(interval.From, interval.To));
                    }
                }
            }

            CheckIntervals(intervals, errors);
        }

        if (errors.Count > 0)
        {
            return new Result(project, drillhole, 0, "", LimitErrors(errors));
        }

        return new Result(
            project,
            drillhole,
            depths.Count,
            BuildStoredProcedureJson(project, drillhole, rows, depths),
            errors);
    }

    // Returns the row's interval when its depths are valid (so it can be
    // compared with other rows), and whether the whole row is valid.
    private static (Interval? Interval, bool IsValid) ValidateRow(
        JsonElement row,
        int rowNumber,
        UploadLookups lookups,
        List<string> errors)
    {
        if (row.ValueKind != JsonValueKind.Object)
        {
            errors.Add($"Row {rowNumber}: must be an object.");
            return (null, false);
        }

        var errorCount = errors.Count;
        var from = ReadDepth(row, "lithoFrom", rowNumber, errors);
        var to = ReadDepth(row, "lithoTo", rowNumber, errors);
        Interval? interval = null;

        if (from >= to)
        {
            errors.Add($"Row {rowNumber}: lithoFrom must be less than lithoTo.");
        }
        else if (from is not null && to is not null)
        {
            interval = new Interval(rowNumber, from.Value, to.Value);
        }

        foreach (var field in CheckedTextFields)
        {
            CheckTextField(row, field, rowNumber, lookups, errors);
        }

        return (interval, errors.Count == errorCount);
    }

    private static void CheckTextField(
        JsonElement row,
        string field,
        int rowNumber,
        UploadLookups lookups,
        List<string> errors)
    {
        if (!row.TryGetProperty(field, out var value) ||
            value.ValueKind == JsonValueKind.Null)
        {
            return;
        }

        if (value.ValueKind != JsonValueKind.String)
        {
            errors.Add($"Row {rowNumber}: {field} must be a text value.");
            return;
        }

        var text = value.GetString()!;
        var maxLength = field == CommentsField ? CommentsSize : CodeSize;

        if (text.Length > maxLength)
        {
            errors.Add($"Row {rowNumber}: {field} must be {maxLength} characters or fewer.");
            return;
        }

        // Empty means "not logged"; anything else must be a known code.
        if (UploadLookups.Fields.Contains(field) &&
            !string.IsNullOrWhiteSpace(text) &&
            !lookups.IsKnown(field, text))
        {
            errors.Add($"Row {rowNumber}: {field} \"{text}\" is not a known code.");
        }
    }

    // Each interval must be the only one covering its depths. Sorted by From,
    // an interval overlaps when it starts before the furthest To seen so far;
    // an exact repeat of an earlier From/To pair is reported as a duplicate.
    // Touching intervals (one's To equals the next one's From) are fine.
    private static void CheckIntervals(List<Interval> intervals, List<string> errors)
    {
        var found = new List<(int Row, string Message)>();
        var firstRowOf = new Dictionary<(decimal, decimal), int>();
        Interval? furthest = null;

        foreach (var interval in intervals
                     .OrderBy(i => i.From)
                     .ThenBy(i => i.To)
                     .ThenBy(i => i.Row))
        {
            if (firstRowOf.TryGetValue((interval.From, interval.To), out var firstRow))
            {
                found.Add((interval.Row,
                    $"Row {interval.Row}: interval {Describe(interval)} duplicates row {firstRow}."));
                continue;
            }

            firstRowOf[(interval.From, interval.To)] = interval.Row;

            if (furthest is not null && interval.From < furthest.To)
            {
                var (earlier, later) = interval.Row < furthest.Row
                    ? (interval, furthest)
                    : (furthest, interval);

                found.Add((later.Row,
                    $"Row {later.Row}: interval {Describe(later)} overlaps row {earlier.Row} ({Describe(earlier)})."));
            }

            if (furthest is null || interval.To > furthest.To)
            {
                furthest = interval;
            }
        }

        errors.AddRange(found.OrderBy(f => f.Row).Select(f => f.Message));
    }

    private static string Describe(Interval interval) =>
        string.Create(CultureInfo.InvariantCulture, $"{interval.From}–{interval.To}");

    // { "project", "drillhole", "rows": [ { lithoFrom, lithoTo, <stored text fields> } ] }
    // Depths become JSON numbers; text values are copied exactly, and a field
    // missing from the upload stays missing (the procedure reads it as NULL).
    private static string BuildStoredProcedureJson(
        string project,
        string drillhole,
        JsonElement rows,
        List<Depths> depths)
    {
        using var buffer = new MemoryStream();

        using (var writer = new Utf8JsonWriter(buffer, PayloadOptions))
        {
            writer.WriteStartObject();
            writer.WriteString("project", project);
            writer.WriteString("drillhole", drillhole);
            writer.WriteStartArray("rows");

            var index = 0;

            foreach (var row in rows.EnumerateArray())
            {
                writer.WriteStartObject();
                writer.WriteNumber("lithoFrom", depths[index].From);
                writer.WriteNumber("lithoTo", depths[index].To);

                foreach (var field in StoredTextFields)
                {
                    if (row.TryGetProperty(field, out var value))
                    {
                        writer.WritePropertyName(field);
                        value.WriteTo(writer);
                    }
                }

                writer.WriteEndObject();
                index++;
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }

    // A depth may be a JSON number or a numeric string, as the app exports it.
    // It must not be negative and must have at most two decimals that matter
    // ("12.50" is fine, "12.505" is not), since the procedure rounds to two.
    private static decimal? ReadDepth(
        JsonElement row,
        string field,
        int rowNumber,
        List<string> errors)
    {
        if (!row.TryGetProperty(field, out var value) ||
            value.ValueKind == JsonValueKind.Null ||
            (value.ValueKind == JsonValueKind.String &&
             string.IsNullOrWhiteSpace(value.GetString())))
        {
            errors.Add($"Row {rowNumber}: {field} is required.");
            return null;
        }

        decimal depth = 0;
        var isValid = value.ValueKind switch
        {
            JsonValueKind.Number => value.TryGetDecimal(out depth),
            JsonValueKind.String => decimal.TryParse(
                value.GetString(),
                DepthStyle,
                CultureInfo.InvariantCulture,
                out depth),
            _ => false
        };

        if (!isValid)
        {
            errors.Add($"Row {rowNumber}: {field} must be a number.");
            return null;
        }

        if (depth < 0)
        {
            errors.Add($"Row {rowNumber}: {field} must not be negative.");
            return null;
        }

        if (decimal.Round(depth, DepthDecimals) != depth)
        {
            errors.Add($"Row {rowNumber}: {field} must have at most {DepthDecimals} decimal places.");
            return null;
        }

        return depth;
    }

    private static string ReadRequiredText(
        JsonElement root,
        string field,
        List<string> errors)
    {
        if (root.TryGetProperty(field, out var value) &&
            value.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(value.GetString()))
        {
            return value.GetString()!;
        }

        errors.Add($"{field} is required and must be text.");
        return "";
    }

    private static IReadOnlyList<string> LimitErrors(List<string> errors) =>
        errors.Count <= MaxReportedErrors
            ? errors
            : [
                .. errors.Take(MaxReportedErrors),
                $"…and {errors.Count - MaxReportedErrors} more errors."
            ];
}
