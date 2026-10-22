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
public static class UploadDataValidator
{
    // Longer lists are cut here with a "…and N more" line.
    private const int MaxReportedErrors = 20;

    // Plain decimals such as "5", "12.75" or "-0.5": no exponent, no
    // thousands separator, so SQL Server can convert the same value.
    private const NumberStyles DepthStyle =
        NumberStyles.AllowLeadingWhite |
        NumberStyles.AllowTrailingWhite |
        NumberStyles.AllowLeadingSign |
        NumberStyles.AllowDecimalPoint;

    // Row attributes the procedure stores, in the order they are written.
    // Each may be missing, null or "" (empty is valid), but not a non-text
    // value. Everything else in a row (id, extractionType, corePass, recovery
    // fields, coreEnd, omFacies, py, lithologicalDescription, …) is dropped.
    private static readonly string[] StoredTextFields =
    [
        "lithoCode", "colorCode", "redoxCode", "ca", "om", "ox",
        "sedim", "granulo", "hardness", "lithologyComments"
    ];

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

    /// <summary>
    /// Validates the document structure and every row, then builds the
    /// stored procedure payload.
    /// </summary>
    /// <exception cref="JsonException">The text is not valid JSON.</exception>
    public static Result Validate(string json)
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
            var rowNumber = 0;

            foreach (var row in rows.EnumerateArray())
            {
                var rowDepths = ValidateRow(row, ++rowNumber, errors);

                if (rowDepths is not null)
                {
                    depths.Add(rowDepths);
                }
            }
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

    // Returns the row's depths when the whole row is valid, otherwise null.
    private static Depths? ValidateRow(JsonElement row, int rowNumber, List<string> errors)
    {
        if (row.ValueKind != JsonValueKind.Object)
        {
            errors.Add($"Row {rowNumber}: must be an object.");
            return null;
        }

        var errorCount = errors.Count;
        var from = ReadDepth(row, "lithoFrom", rowNumber, errors);
        var to = ReadDepth(row, "lithoTo", rowNumber, errors);

        if (from >= to)
        {
            errors.Add($"Row {rowNumber}: lithoFrom must be less than lithoTo.");
        }

        foreach (var field in StoredTextFields)
        {
            if (row.TryGetProperty(field, out var value) &&
                value.ValueKind is not (JsonValueKind.String or JsonValueKind.Null))
            {
                errors.Add($"Row {rowNumber}: {field} must be a text value.");
            }
        }

        return errors.Count == errorCount ? new Depths(from!.Value, to!.Value) : null;
    }

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
