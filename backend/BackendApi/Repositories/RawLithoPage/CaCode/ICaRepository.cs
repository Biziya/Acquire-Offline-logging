using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.CaCode;

public interface ICaRepository
{
    Task<IReadOnlyList<CaCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
