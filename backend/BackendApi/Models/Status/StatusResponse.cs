using System.Text.Json.Serialization;

namespace BackendApi.Models.Status;

/// <summary>
/// <c>UserName</c> and <c>FullUsername</c> are present only for
/// <c>?includeUser=true</c>: the Windows user proven by Windows Integrated
/// Authentication. FullUsername retains the original machine/domain authority.
/// IsAuthorized says whether that user may use the website (member of
/// Auth:AllowedGroup, or no group configured).
/// </summary>
public sealed record StatusResponse(
    string Status,
    string Message,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? UserName = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? FullUsername = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? IsAuthorized = null);
