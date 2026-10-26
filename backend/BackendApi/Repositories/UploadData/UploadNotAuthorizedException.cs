namespace BackendApi.Repositories.UploadData;

/// <summary>
/// SQL Server refused the uploader: the procedure raised
/// <see cref="UploadDataRepository.NotAuthorizedErrorNumber"/> before
/// inserting anything (see Sql/UploadDataUserAuthorization.sql).
/// </summary>
public sealed class UploadNotAuthorizedException(string userName, Exception innerException)
    : Exception($"SQL Server did not authorize {userName} to upload.", innerException)
{
    public string UserName { get; } = userName;
}
