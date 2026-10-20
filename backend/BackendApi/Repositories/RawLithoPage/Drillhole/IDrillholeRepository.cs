using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.Drillhole;

public interface IDrillholeRepository
{
    Task<IReadOnlyList<DrillholeResponse>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
