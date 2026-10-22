using System.Text.Json.Nodes;

namespace BackendApi.Tests.UploadData;

/// <summary>Documents in the app's export format, built fresh for each test.</summary>
internal static class TestDocuments
{
    public static JsonObject Valid() => new()
    {
        ["project"] = "ZOOVCH",
        ["campaign"] = "2015",
        ["drillhole"] = "GTZO_0001_1",
        ["created_at"] = "2026-09-06T07:57:03.803Z",
        ["modified_at"] = "2026-10-22T05:31:40.296Z",
        ["rows"] = new JsonArray(Row("5", "10"))
    };

    /// <summary>
    /// What the stored procedure receives for <see cref="Valid"/>: the task's
    /// reference payload, field for field.
    /// </summary>
    public const string ValidStoredProcedureJson =
        """{"project":"ZOOVCH","drillhole":"GTZO_0001_1","rows":[{"lithoFrom":5,"lithoTo":10,"lithoCode":"0--","colorCode":"10G4/2","redoxCode":"0042_MN1","ca":"","om":"","ox":"","sedim":"","granulo":"","hardness":"","lithologyComments":""}]}""";

    /// <summary>A valid document with intervals 0–5, 5–10, … as numeric strings.</summary>
    public static JsonObject WithRows(int count)
    {
        var document = Valid();
        var rows = new JsonArray();

        for (var i = 0; i < count; i++)
        {
            rows.Add(Row($"{i * 5}", $"{(i + 1) * 5}"));
        }

        document["rows"] = rows;
        return document;
    }

    public static JsonObject Row(JsonNode lithoFrom, JsonNode lithoTo) => new()
    {
        ["id"] = 61,
        ["extractionType"] = "",
        ["corePass"] = "",
        ["recoveryStart"] = "",
        ["recoveryEnd"] = "",
        ["coreEnd"] = "",
        ["lithoFrom"] = lithoFrom,
        ["lithoTo"] = lithoTo,
        ["lithoCode"] = "0--",
        ["colorCode"] = "10G4/2",
        ["ca"] = "",
        ["om"] = "",
        ["omFacies"] = "",
        ["py"] = "",
        ["ox"] = "",
        ["sedim"] = "",
        ["redoxCode"] = "0042_MN1",
        ["granulo"] = "",
        ["hardness"] = "",
        ["lithologyComments"] = "",
        ["lithologicalDescription"] = ""
    };
}
