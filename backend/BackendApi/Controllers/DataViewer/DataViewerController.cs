using BackendApi.Models.DataViewer;
using BackendApi.Models.Drillholes;
using BackendApi.Repositories.DataViewer;
using BackendApi.Repositories.Drillholes;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.DataViewer;

[ApiController]
[Route("api/dataviewer")]
[Tags("DataViewer")]
public sealed class DataViewerController : ControllerBase
{
    private readonly IDataViewerRepository _records;
    private readonly IDrillholeRepository _drillholes;
    private readonly ILogger<DataViewerController> _logger;

    public DataViewerController(
        IDataViewerRepository records,
        IDrillholeRepository drillholes,
        ILogger<DataViewerController> logger)
    {
        _records = records;
        _drillholes = drillholes;
        _logger = logger;
    }

    /// <summary>
    /// The stored records of one drillhole (CoreDescrData.HOLEID), with its
    /// Project and Campaign. Read-only.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<DataViewerResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<DataViewerResponse>> Get(
        [FromQuery] string? drillhole,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(drillhole))
        {
            return BadRequest(new { error = "The drillhole query parameter is required." });
        }

        if (drillhole.Length > DataViewerRepository.HoleIdSize)
        {
            return BadRequest(new
            {
                error = $"drillhole must be {DataViewerRepository.HoleIdSize} characters or fewer."
            });
        }

        try
        {
            var records = await _records.GetByHoleIdAsync(drillhole, cancellationToken);
            var collars = await _drillholes.GetByHoleIdAsync(drillhole, cancellationToken);
            var collar = FindCollar(collars, records);

            if (collar is null && collars.Count > 1)
            {
                _logger.LogWarning(
                    "Drillhole {Drillhole} has {Count} conflicting entries in the drillhole list; Campaign left empty.",
                    drillhole,
                    collars.Count);
            }

            return Ok(new DataViewerResponse
            {
                Drillhole = drillhole,
                Project = collar?.ProjectCode ?? SingleProjectCode(records),
                Campaign = collar?.Campaign,
                Records = records
            });
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(exception, "Failed to retrieve Data Viewer records for drillhole {Drillhole}.", drillhole);

            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = "Unable to retrieve drillhole records." });
        }
    }

    /*
     * The drillhole-list entry for this HOLEID: the only one or, when the list
     * holds several, the only one whose project matches the stored records.
     * Anything still ambiguous gives null rather than a guess.
     */
    private static DrillholeResponse? FindCollar(
        IReadOnlyList<DrillholeResponse> collars,
        IReadOnlyList<DataViewerRecord> records)
    {
        var candidates = collars
            .DistinctBy(collar => (collar.ProjectCode, collar.Campaign))
            .ToList();

        if (candidates.Count > 1 && SingleProjectCode(records) is { } project)
        {
            candidates = candidates.Where(collar => collar.ProjectCode == project).ToList();
        }

        return candidates.Count == 1 ? candidates[0] : null;
    }

    // The PROJECTCODE all stored rows agree on, if they agree on exactly one.
    private static string? SingleProjectCode(IReadOnlyList<DataViewerRecord> records)
    {
        var projects = records
            .Select(record => record.ProjectCode)
            .Where(project => !string.IsNullOrWhiteSpace(project))
            .Distinct()
            .ToList();

        return projects.Count == 1 ? projects[0] : null;
    }
}
