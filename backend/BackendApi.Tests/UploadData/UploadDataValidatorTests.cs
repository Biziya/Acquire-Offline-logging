using System.Text.Json;
using System.Text.Json.Nodes;
using BackendApi.Controllers.UploadData;

namespace BackendApi.Tests.UploadData;

public sealed class UploadDataValidatorTests
{
    [Fact]
    public void RejectsTheHalfFilledLastRowOfARealExport()
    {
        // A real export saved mid-entry: row 31 has lithoFrom but no lithoTo.
        var json = File.ReadAllText(Path.Combine("Samples", "GTZO_0001_1.json"));

        var result = UploadDataValidator.Validate(json);

        Assert.Equal(["Row 31: lithoTo is required."], result.Errors);
        Assert.Equal("ZOOVCH", result.Project);
        Assert.Equal("GTZO_0001_1", result.Drillhole);
        Assert.Equal(0, result.TotalRows);
        Assert.Equal("", result.StoredProcedureJson);
    }

    [Fact]
    public void BuildsTheReferenceStoredProcedurePayload()
    {
        var result = UploadDataValidator.Validate(TestDocuments.Valid().ToJsonString());

        Assert.Equal(TestDocuments.ValidStoredProcedureJson, result.StoredProcedureJson);
    }

    [Fact]
    public void DropsEveryFieldTheProcedureDoesNotStore()
    {
        var document = TestDocuments.Valid();
        document["created_by"] = "CORP\\creator";
        document["extraMetadata"] = "x";
        var row = document["rows"]![0]!.AsObject();
        row["py"] = "P1";
        row["omFacies"] = "F2";
        row["unknownField"] = 7;

        var payload = JsonNode.Parse(UploadDataValidator.Validate(document.ToJsonString()).StoredProcedureJson)!;

        Assert.Equal(["project", "drillhole", "rows"], payload.AsObject().Select(p => p.Key));
        Assert.Equal(
            ["lithoFrom", "lithoTo", "lithoCode", "colorCode", "redoxCode", "ca", "om", "ox",
             "sedim", "granulo", "hardness", "lithologyComments"],
            payload["rows"]![0]!.AsObject().Select(p => p.Key));
    }

    [Fact]
    public void KeepsValuesExactlyAndAddsNoDefaults()
    {
        var document = TestDocuments.Valid();
        var row = document["rows"]![0]!.AsObject();
        row["lithoFrom"] = " 12.50 ";
        row["lithoTo"] = 13.75m;
        row["lithologyComments"] = "Шавар, fine  sand + clay <5%>";
        row["granulo"] = null;
        row.Remove("hardness");
        document["drillhole"] = " GTZO_0001_1";

        var payload = JsonNode.Parse(UploadDataValidator.Validate(document.ToJsonString()).StoredProcedureJson)!;
        var stored = payload["rows"]![0]!.AsObject();

        Assert.Equal(" GTZO_0001_1", payload["drillhole"]!.GetValue<string>());
        Assert.Equal("12.50", stored["lithoFrom"]!.ToJsonString());
        Assert.Equal("13.75", stored["lithoTo"]!.ToJsonString());
        Assert.Equal("Шавар, fine  sand + clay <5%>", stored["lithologyComments"]!.GetValue<string>());
        Assert.Equal("0--", stored["lithoCode"]!.GetValue<string>());
        Assert.Equal("", stored["ca"]!.GetValue<string>());
        Assert.True(stored.ContainsKey("granulo"));
        Assert.Null(stored["granulo"]);
        Assert.False(stored.ContainsKey("hardness"));
    }

    [Fact]
    public void AcceptsADocumentOfConsecutiveIntervals()
    {
        var result = UploadDataValidator.Validate(TestDocuments.WithRows(53).ToJsonString());

        Assert.Empty(result.Errors);
        Assert.Equal(53, result.TotalRows);
    }

    [Fact]
    public void AcceptsEmptyOptionalAttributesAndNumericDepths()
    {
        var document = TestDocuments.Valid();
        document["rows"]!.AsArray().Add(TestDocuments.Row(10, 12.5m));

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Empty(result.Errors);
        Assert.Equal(2, result.TotalRows);
    }

    [Fact]
    public void ThrowsForInvalidJsonSyntax()
    {
        Assert.ThrowsAny<JsonException>(() => UploadDataValidator.Validate("{ \"project\": "));
    }

    [Fact]
    public void RejectsANonObjectRoot()
    {
        var result = UploadDataValidator.Validate("[]");

        Assert.Equal(["The JSON root must be an object."], result.Errors);
    }

    [Theory]
    [InlineData("project")]
    [InlineData("drillhole")]
    public void RejectsAMissingRequiredField(string field)
    {
        var document = TestDocuments.Valid();
        document.Remove(field);

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal([$"{field} is required and must be text."], result.Errors);
    }

    [Fact]
    public void RejectsABlankDrillhole()
    {
        var document = TestDocuments.Valid();
        document["drillhole"] = "  ";

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal(["drillhole is required and must be text."], result.Errors);
    }

    [Fact]
    public void RejectsADrillholeLongerThanTheHoleParameter()
    {
        var document = TestDocuments.Valid();
        document["drillhole"] = new string('H', 21);

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal(["drillhole must be 20 characters or fewer."], result.Errors);
    }

    [Fact]
    public void RejectsMissingRows()
    {
        var document = TestDocuments.Valid();
        document.Remove("rows");

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal(["rows is required and must be an array."], result.Errors);
    }

    [Fact]
    public void RejectsEmptyRows()
    {
        var document = TestDocuments.Valid();
        document["rows"] = new JsonArray();

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal(["rows must contain at least one record."], result.Errors);
    }

    [Theory]
    [InlineData("abc", "Row 1: lithoFrom must be a number.")]
    [InlineData("", "Row 1: lithoFrom is required.")]
    [InlineData("1e2", "Row 1: lithoFrom must be a number.")]
    [InlineData("1,5", "Row 1: lithoFrom must be a number.")]
    public void RejectsAnInvalidDepth(string lithoFrom, string expected)
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoFrom"] = lithoFrom;

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal([expected], result.Errors);
    }

    [Theory]
    [InlineData("10", "5")]
    [InlineData("5", "5")]
    public void RejectsAnIntervalThatIsNotIncreasing(string lithoFrom, string lithoTo)
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoFrom"] = lithoFrom;
        document["rows"]![0]!["lithoTo"] = lithoTo;

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal(["Row 1: lithoFrom must be less than lithoTo."], result.Errors);
    }

    [Fact]
    public void RejectsANonTextStoredAttribute()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoCode"] = 3;

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal(["Row 1: lithoCode must be a text value."], result.Errors);
    }

    [Fact]
    public void ReportsTheRowNumberOfEachBadRow()
    {
        var document = TestDocuments.Valid();
        var rows = document["rows"]!.AsArray();
        rows.Add(TestDocuments.Row(10, 15));
        rows.Add(TestDocuments.Row(20, 15));

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal(["Row 3: lithoFrom must be less than lithoTo."], result.Errors);
    }

    [Fact]
    public void CapsALongErrorList()
    {
        var document = TestDocuments.Valid();
        var rows = new JsonArray();
        for (var i = 0; i < 25; i++)
        {
            rows.Add(TestDocuments.Row(5, 1));
        }
        document["rows"] = rows;

        var result = UploadDataValidator.Validate(document.ToJsonString());

        Assert.Equal(21, result.Errors.Count);
        Assert.Equal("…and 5 more errors.", result.Errors[^1]);
    }
}
