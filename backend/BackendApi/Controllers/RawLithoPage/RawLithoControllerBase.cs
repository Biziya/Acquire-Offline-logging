using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers.RawLithoPage;

/// <summary>
/// Shared plumbing for the Raw Litho read endpoints.
/// Each action just names its repository call and the subject used in messages;
/// success, cancellation and failure handling live here so the controllers stay thin.
/// </summary>
public abstract class RawLithoControllerBase : ControllerBase
{
    private readonly ILogger _logger;

    protected RawLithoControllerBase(ILogger logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Runs a repository read and returns <c>200 OK</c> with the rows,
    /// or logs the failure and returns a safe <c>500</c> error payload.
    /// </summary>
    protected async Task<ActionResult<IReadOnlyList<T>>> GetAllOrErrorAsync<T>(
        Func<CancellationToken, Task<IReadOnlyList<T>>> loadAsync,
        string subject,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await loadAsync(cancellationToken));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to retrieve {Subject}.", subject);

            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = $"Unable to retrieve {subject}." });
        }
    }
}
