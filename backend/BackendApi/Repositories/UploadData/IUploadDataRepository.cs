namespace BackendApi.Repositories.UploadData;

public interface IUploadDataRepository
{
    Task UploadAsync(
        string processedJson,
        CancellationToken cancellationToken = default);
}
