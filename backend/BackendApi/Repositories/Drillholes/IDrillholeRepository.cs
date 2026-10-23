using BackendApi.Models.Drillholes;

namespace BackendApi.Repositories.Drillholes;

public interface IDrillholeRepository
{
    Task<IReadOnlyList<DrillholeResponse>> GetAllAsync(
        CancellationToken cancellationToken = default);

    /// <summary>The collar rows of one HOLEID (normally one, none if unknown).</summary>
    Task<IReadOnlyList<DrillholeResponse>> GetByHoleIdAsync(
        string holeId,
        CancellationToken cancellationToken = default);
}
