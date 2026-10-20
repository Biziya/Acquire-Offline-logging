using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.RedoxCode;

public interface IRedoxCodeRepository
{
    Task<IReadOnlyList<RedoxCodeDto>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
