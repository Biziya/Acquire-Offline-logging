namespace BackendApi.Repositories.RawLithoPage;

/// <summary>
/// Shape of a row returned by the <c>QV_VS_LOOKUP_RO</c> lookup queries.
/// Column names (<c>LOOKUP</c>, <c>DESCRIPTION</c>) are mapped by Dapper.
/// </summary>
internal sealed class LookupRow
{
    public string? Lookup { get; set; }

    public string? Description { get; set; }
}
