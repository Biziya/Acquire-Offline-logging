namespace BackendApi.Repositories.UploadData;

/// <summary>
/// The upload procedure refused the file's content (THROW 51003–51009 in
/// Sql/insertAcQuireOfflineBek.sql), such as two rows with the same depths
/// or a value longer than its column. Nothing was stored. The message is the
/// procedure's own and is safe to show to the uploader.
/// </summary>
public sealed class UploadRejectedException(string message, Exception innerException)
    : Exception(message, innerException)
{
    // Error numbers the procedure raises for content it refuses.
    public const int FirstErrorNumber = 51003;
    public const int LastErrorNumber = 51009;

    public static bool IsRejection(int errorNumber) =>
        errorNumber is >= FirstErrorNumber and <= LastErrorNumber and not 51008;
}
