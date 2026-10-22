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
        Assert.Equal(31, result.TotalRows);
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
