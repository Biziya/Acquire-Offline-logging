using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.LithoCode;

public interface ILithoCodeRepository
{
    Task<IReadOnlyList<LithoCodeResponse>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
