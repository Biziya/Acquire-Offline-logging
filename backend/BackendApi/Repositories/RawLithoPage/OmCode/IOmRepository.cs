using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.OmCode;

public interface IOmRepository
{
    Task<IReadOnlyList<OmCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
