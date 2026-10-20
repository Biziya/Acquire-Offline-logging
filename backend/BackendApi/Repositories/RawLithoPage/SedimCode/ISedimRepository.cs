using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.SedimCode;

public interface ISedimRepository
{
    Task<IReadOnlyList<SedimCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
