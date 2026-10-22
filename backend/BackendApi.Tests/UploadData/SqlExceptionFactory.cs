using System.Reflection;
using Microsoft.Data.SqlClient;

namespace BackendApi.Tests.UploadData;

/// <summary>
/// Builds a real <see cref="SqlException"/>, which has no public constructor,
/// through SqlClient's internal factory. Fails loudly if those internals change.
/// </summary>
internal static class SqlExceptionFactory
{
    private const BindingFlags Any =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;

    public static SqlException Create(int number, string message)
    {
        // SqlError(int infoNumber, byte errorState, byte errorClass, string server,
        //          string errorMessage, string procedure, int lineNumber, ...)
        var errorConstructor = typeof(SqlError)
            .GetConstructors(Any)
            .OrderByDescending(constructor => constructor.GetParameters().Length)
            .First();
        var error = (SqlError)errorConstructor.Invoke(
            errorConstructor.GetParameters()
                .Select((parameter, index) => index switch
                {
                    0 => number,
                    1 => (byte)5,
                    2 => (byte)14,
                    3 => "test-server",
                    4 => message,
                    5 => "InsertUpdateCoreDescr_WellCAD",
                    6 => 1,
                    _ => parameter.HasDefaultValue ? parameter.DefaultValue : null
                })
                .ToArray());

        var errors = (SqlErrorCollection)typeof(SqlErrorCollection)
            .GetConstructors(Any)
            .Single(constructor => constructor.GetParameters().Length == 0)
            .Invoke(null);
        typeof(SqlErrorCollection).GetMethod("Add", Any)!.Invoke(errors, [error]);

        return (SqlException)typeof(SqlException)
            .GetMethods(Any)
            .Single(method =>
                method.Name == "CreateException" &&
                method.GetParameters().Select(parameter => parameter.ParameterType)
                    .SequenceEqual([typeof(SqlErrorCollection), typeof(string)]))
            .Invoke(null, [errors, "16.00.0000"])!;
    }
}
