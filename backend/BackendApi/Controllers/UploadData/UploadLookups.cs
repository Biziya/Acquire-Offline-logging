using BackendApi.Models.TableConstants;

namespace BackendApi.Controllers.UploadData;

/// <summary>
/// The lookup codes an uploaded row may use, per row field, taken from the
/// lists <see cref="Repositories.TableConstants.TableConstantsRepository"/>
/// loads (QV_VS_LOOKUP_RO). Codes are matched case-insensitively, as SQL
/// Server's default collation compares them.
/// </summary>
public sealed class UploadLookups
{
    /// <summary>Row fields that must hold one of their list's codes (or be empty).</summary>
    public static readonly IReadOnlyList<string> Fields =
    [
        "lithoCode", "colorCode", "redoxCode", "ca", "om", "omFacies", "py", "ox", "sedim"
    ];

    private readonly Dictionary<string, HashSet<string>> _codes;

    /// <param name="codes">Allowed codes per field in <see cref="Fields"/>; a missing field allows none.</param>
    public UploadLookups(IReadOnlyDictionary<string, IEnumerable<string?>> codes)
    {
        _codes = Fields.ToDictionary(
            field => field,
            field => codes.TryGetValue(field, out var list)
                ? list.Where(code => !string.IsNullOrEmpty(code))
                      .Select(code => code!)
                      .ToHashSet(StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(StringComparer.OrdinalIgnoreCase));
    }

    public static UploadLookups From(TableConstantsResponse lists) => new(
        new Dictionary<string, IEnumerable<string?>>
        {
            ["lithoCode"] = lists.LithoCode.Select(item => item.LithoCode),
            ["colorCode"] = lists.ColourCode.Select(item => item.ColourCode),
            ["redoxCode"] = lists.RedoxCode.Select(item => item.RedoxCode),
            ["ca"] = lists.CaCode.Select(item => item.CaCode),
            ["om"] = lists.OmCode.Select(item => item.OmCode),
            ["omFacies"] = lists.OmFaciesCode.Select(item => item.OmFaciesCode),
            ["py"] = lists.PyCode.Select(item => item.PyCode),
            ["ox"] = lists.OxCode.Select(item => item.OxCode),
            ["sedim"] = lists.SedimCode.Select(item => item.SedimCode)
        });

    public bool IsKnown(string field, string code) =>
        _codes.TryGetValue(field, out var codes) && codes.Contains(code);
}
