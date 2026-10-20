using BackendApi.Models.RawLithoPage;

namespace BackendApi.Repositories.RawLithoPage.ColourCode;

public interface IColourRepository
{
    Task<IReadOnlyList<ColourCodeResponse>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
