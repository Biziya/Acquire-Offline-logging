using BackendApi.Models.DataViewer;

namespace BackendApi.Repositories.DataViewer;

public interface IDataViewerRepository
{
    /// <summary>Every distinct, non-blank HOLEID in CoreDescrData, sorted. Read-only.</summary>
    Task<IReadOnlyList<string>> GetHoleIdsAsync(CancellationToken cancellationToken = default);

    /// <summary>Every CoreDescrData row of one HOLEID, ordered by FROM, TO. Read-only.</summary>
    Task<IReadOnlyList<DataViewerRecord>> GetByHoleIdAsync(
        string holeId,
        CancellationToken cancellationToken = default);
}
