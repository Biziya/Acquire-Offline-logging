using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.OmFaciesCode;

public interface IOmFaciesRepository
{
    Task<IReadOnlyList<OmFaciesCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
