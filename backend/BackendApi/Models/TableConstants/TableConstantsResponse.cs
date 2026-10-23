namespace BackendApi.Models.TableConstants;

/// <summary>
/// The nine Raw Litho lookup lists. Each list keeps the item shape its former
/// endpoint returned ({ "caCode": …, "description": … } and so on).
/// </summary>
public sealed class TableConstantsResponse
{
    public List<CaCodeItem> CaCode { get; } = [];
    public List<ColourCodeItem> ColourCode { get; } = [];
    public List<LithoCodeItem> LithoCode { get; } = [];
    public List<OmCodeItem> OmCode { get; } = [];
    public List<OmFaciesCodeItem> OmFaciesCode { get; } = [];
    public List<OxCodeItem> OxCode { get; } = [];
    public List<PyCodeItem> PyCode { get; } = [];
    public List<RedoxCodeItem> RedoxCode { get; } = [];
    public List<SedimCodeItem> SedimCode { get; } = [];
}

public sealed record CaCodeItem(string? CaCode, string? Description);
public sealed record ColourCodeItem(string? ColourCode, string? Description);
public sealed record LithoCodeItem(string? LithoCode, string? Description);
public sealed record OmCodeItem(string? OmCode, string? Description);
public sealed record OmFaciesCodeItem(string? OmFaciesCode, string? Description);
public sealed record OxCodeItem(string? OxCode, string? Description);
public sealed record PyCodeItem(string? PyCode, string? Description);
public sealed record RedoxCodeItem(string? RedoxCode, string? Description);
public sealed record SedimCodeItem(string? SedimCode, string? Description);
