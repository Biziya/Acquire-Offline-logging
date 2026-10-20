using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.PyCode;

public interface IPyRepository
{
    Task<IReadOnlyList<PyCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
