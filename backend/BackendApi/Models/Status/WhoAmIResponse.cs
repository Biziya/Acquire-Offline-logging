namespace BackendApi.Models.Status;

/// <summary>The Windows user proven by Windows Integrated Authentication.</summary>
public sealed record WhoAmIResponse(string UserName);
