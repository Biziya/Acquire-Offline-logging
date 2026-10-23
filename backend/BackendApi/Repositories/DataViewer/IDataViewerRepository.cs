using BackendApi.Models.DataViewer;

namespace BackendApi.Repositories.DataViewer;

public interface IDataViewerRepository
{
    /// <summary>Every CoreDescrData row of one HOLEID. Read-only.</summary>
    Task<IReadOnlyList<DataViewerRecord>> GetByHoleIdAsync(
        string holeId,
        CancellationToken cancellationToken = default);
}
