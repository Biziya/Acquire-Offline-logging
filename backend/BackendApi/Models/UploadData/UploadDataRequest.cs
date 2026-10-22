namespace BackendApi.Models.UploadData;

/// <summary>
/// One validated upload, passed to <c>dbo.InsertUpdateCoreDescr_WellCAD</c>.
/// </summary>
public sealed class UploadDataRequest
{
    /// <summary>The JSON <c>drillhole</c> value, sent as <c>@Hole</c>.</summary>
    public required string Drillhole { get; init; }

    /// <summary>
    /// The authenticated web user, sent as <c>@usr</c>, or <c>null</c> for an
    /// anonymous request. The procedure replaces it with <c>SUSER_NAME()</c>.
    /// </summary>
    public string? UserName { get; init; }

    /// <summary>The uploaded file name, sent as <c>@fileName</c>.</summary>
    public required string FileName { get; init; }

    /// <summary>
    /// The validated upload reduced to the fields the procedure stores
    /// (see <c>UploadDataValidator</c>), sent as <c>@str_json</c>.
    /// </summary>
    public required string Json { get; init; }
}
