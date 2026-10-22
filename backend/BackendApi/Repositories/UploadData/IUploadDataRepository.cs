using BackendApi.Models.UploadData;

namespace BackendApi.Repositories.UploadData;

public interface IUploadDataRepository
{
    /// <summary>
    /// Runs the stored procedure's <c>Raw core import_JSON</c> action once for
    /// the whole document. Database errors propagate to the caller.
    /// </summary>
    Task UploadAsync(
        UploadDataRequest request,
        CancellationToken cancellationToken = default);
}
