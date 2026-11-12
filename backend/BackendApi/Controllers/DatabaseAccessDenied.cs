using BackendApi.Data;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers;

/// <summary>
/// 403 for a SQL Server permission denial (see <see cref="DatabaseAccessErrors"/>).
/// The response names the Windows user and the action, never the denied
/// object or database; the log keeps SQL Server's message.
/// </summary>
public static class DatabaseAccessDenied
{
    public static string Message(ControllerBase controller, string action) =>
        $"{UserName(controller)} has no database permission to {action}. Contact the database administrator.";

    public static ObjectResult Result(ControllerBase controller, ILogger logger, Exception exception, string action)
    {
        var error = DatabaseAccessErrors.Find(exception);

        logger.LogWarning(
            exception,
            "SQL Server denied {WindowsUser} permission to {Action}: error {SqlErrorNumber}: {SqlMessage}",
            UserName(controller),
            action,
            error?.Number,
            error?.Message);

        return controller.StatusCode(
            StatusCodes.Status403Forbidden,
            new { error = Message(controller, action) });
    }

    /// <summary>
    /// Runs a database read: 200 with the result, 403 when SQL Server denies
    /// permission, 500 with <paramref name="failureMessage"/> on any other error.
    /// </summary>
    public static async Task<ActionResult<T>> ReadAsync<T>(
        ControllerBase controller,
        ILogger logger,
        string action,
        string failureMessage,
        Func<Task<T>> read,
        CancellationToken cancellationToken)
    {
        try
        {
            return controller.Ok(await read());
        }
        catch (Exception exception) when (DatabaseAccessErrors.Find(exception) is not null)
        {
            return Result(controller, logger, exception, action);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogError(exception, "Failed to {Action}.", action);

            return controller.StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = failureMessage });
        }
    }

    private static string UserName(ControllerBase controller) =>
        controller.User.Identity?.Name is { Length: > 0 } name ? name : "This account";
}
