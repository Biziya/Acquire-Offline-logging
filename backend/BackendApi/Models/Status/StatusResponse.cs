using System.Text.Json.Serialization;

namespace BackendApi.Models.Status;

/// <summary>
/// <c>UserName</c> is present only for <c>?includeUser=true</c>: the Windows
/// user proven by Windows Integrated Authentication.
/// </summary>
public sealed record StatusResponse(
    string Status,
    string Message,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? UserName = null);
