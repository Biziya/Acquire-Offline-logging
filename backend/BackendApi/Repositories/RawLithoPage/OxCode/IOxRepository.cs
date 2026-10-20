using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.OxCode;

public interface IOxRepository
{
    Task<IReadOnlyList<OxCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
