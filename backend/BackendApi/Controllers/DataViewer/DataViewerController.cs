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
    /// Every drillhole with stored records (distinct CoreDescrData.HOLEID),
    /// sorted. Read-only.
    /// </summary>
    [HttpGet("drillholes")]
    [ProducesResponseType<IReadOnlyList<string>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<IReadOnlyList<string>>> GetDrillholes(CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _records.GetHoleIdsAsync(cancellationToken));
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(exception, "Failed to retrieve the Data Viewer drillholes.");

            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = "Unable to retrieve drillholes." });
        }
    }

    /// <summary>
    /// The stored lithology of one drillhole (CoreDescrData.HOLEID), one entry
    /// per interval, with its Project and Campaign. Read-only.
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

        IReadOnlyList<DataViewerRecord> records;

        try
        {
            records = await _records.GetByHoleIdAsync(drillhole, cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(exception, "Failed to retrieve Data Viewer records for drillhole {Drillhole}.", drillhole);

            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = "Unable to retrieve drillhole records." });
        }

        var projects = await FindProjectsAsync(drillhole, records, cancellationToken);
        var (intervals, hiddenValues) = DataViewerIntervals.Build(records);

        return Ok(new DataViewerResponse
        {
            Drillhole = drillhole,
            Project = projects.Count == 1 ? projects[0].ProjectCode : null,
            Campaign = projects.Count == 1 ? projects[0].Campaign : null,
            Projects = projects,
            TotalRecords = records.Count,
            HiddenValues = hiddenValues,
            StoredBy = Distinct(records.Select(record => record.Usr)),
            FileNames = Distinct(records.Select(record => record.FileName)),
            Intervals = intervals
        });
    }

    /*
     * Each PROJECTCODE stored for the drillhole, with the Campaign of the
     * drillhole-list entry that has the same HOLEID and PROJECTCODE (HOLEID
     * alone may belong to several projects). No entry, or entries that
     * disagree: Campaign is null, never guessed. The drillhole list is read
     * once per request. If it cannot be read, the records are still shown
     * and Campaign stays null.
     */
    private async Task<IReadOnlyList<DataViewerProject>> FindProjectsAsync(
        string drillhole,
        IReadOnlyList<DataViewerRecord> records,
        CancellationToken cancellationToken)
    {
        var projectCodes = Distinct(records.Select(record => record.ProjectCode));

        if (projectCodes.Count == 0)
        {
            return [];
        }

        IReadOnlyList<DrillholeResponse> collars = [];

        try
        {
            collars = await _drillholes.GetByHoleIdAsync(drillhole, cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(exception, "Campaign lookup failed for drillhole {Drillhole}; Campaign left empty.", drillhole);
        }

        return projectCodes
            .Select(projectCode =>
            {
                var campaigns = Distinct(collars
                    .Where(collar => string.Equals(collar.ProjectCode?.Trim(), projectCode, StringComparison.OrdinalIgnoreCase))
                    .Select(collar => collar.Campaign));

                if (campaigns.Count > 1)
                {
                    _logger.LogWarning(
                        "Drillhole {Drillhole} project {Project} has {Count} campaigns in the drillhole list; Campaign left empty.",
                        drillhole,
                        projectCode,
                        campaigns.Count);
                }

                return new DataViewerProject
                {
                    ProjectCode = projectCode,
                    Campaign = campaigns.Count == 1 ? campaigns[0] : null
                };
            })
            .ToList();
    }

    // Trimmed, non-blank, without case-insensitive repeats (as SQL Server
    // compares them), in first-seen order.
    private static IReadOnlyList<string> Distinct(IEnumerable<string?> values) =>
        values
            .Select(value => value?.Trim())
            .OfType<string>()
            .Where(value => value.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
}
