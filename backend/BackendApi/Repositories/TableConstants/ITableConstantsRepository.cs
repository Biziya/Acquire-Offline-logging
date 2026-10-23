using BackendApi.Models.TableConstants;

namespace BackendApi.Repositories.TableConstants;

public interface ITableConstantsRepository
{
    Task<TableConstantsResponse> GetAllAsync(
        CancellationToken cancellationToken = default);
}
