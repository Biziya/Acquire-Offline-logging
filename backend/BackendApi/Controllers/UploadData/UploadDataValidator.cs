using System.Globalization;
using System.Text.Json;
using BackendApi.Repositories.UploadData;

namespace BackendApi.Controllers.UploadData;

/// <summary>
/// Checks an uploaded lithology document before it reaches the stored
/// procedure. It only reads the JSON; the original text is what gets uploaded.
/// </summary>
public static class UploadDataValidator
{
    // Longer lists are cut here with a "…and N more" line.
    private const int MaxReportedErrors = 20;

    // Plain decimals such as "5", "12.75" or "-0.5": no exponent, no
    // thousands separator, so SQL Server can convert the same text.
    private const NumberStyles DepthStyle =
        NumberStyles.AllowLeadingWhite |
        NumberStyles.AllowTrailingWhite |
        NumberStyles.AllowLeadingSign |
        NumberStyles.AllowDecimalPoint;

    // Row attributes the procedure's "Raw core import_JSON" branch stores.
    // Each may be missing, null or "" (empty is valid), but not a non-text value.
    private static readonly string[] StoredTextFields =
    [
        "lithoCode", "colorCode", "redoxCode", "ca", "om", "ox",
        "sedim", "granulo", "hardness", "lithologyComments"
    ];

    public sealed record Result(
        string Project,
        string Drillhole,
        int TotalRows,
        IReadOnlyList<string> Errors);

    /// <summary>
    /// Validates the document structure and every row.
    /// </summary>
    /// <exception cref="JsonException">The text is not valid JSON.</exception>
    public static Result Validate(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        if (root.ValueKind != JsonValueKind.Object)
        {
            return new Result("", "", 0, ["The JSON root must be an object."]);
        }

        var errors = new List<string>();
        var project = ReadRequiredText(root, "project", errors);
        var drillhole = ReadRequiredText(root, "drillhole", errors);

        if (drillhole.Length > UploadDataRepository.HoleSize)
        {
            errors.Add(
                $"drillhole must be {UploadDataRepository.HoleSize} characters or fewer.");
        }

        var totalRows = 0;

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
            totalRows = rows.GetArrayLength();
            var rowNumber = 0;

            foreach (var row in rows.EnumerateArray())
            {
                ValidateRow(row, ++rowNumber, errors);
            }
        }

        return new Result(project, drillhole, totalRows, LimitErrors(errors));
    }

    private static void ValidateRow(JsonElement row, int rowNumber, List<string> errors)
    {
        if (row.ValueKind != JsonValueKind.Object)
        {
            errors.Add($"Row {rowNumber}: must be an object.");
            return;
        }

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
