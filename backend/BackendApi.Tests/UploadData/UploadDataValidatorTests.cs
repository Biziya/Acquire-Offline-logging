using System.Text.Json;
using System.Text.Json.Nodes;
using BackendApi.Controllers.UploadData;
using BackendApi.Repositories.TableConstants;

namespace BackendApi.Tests.UploadData;

public sealed class UploadDataValidatorTests
{
    [Fact]
    public void RejectsTheHalfFilledLastRowOfARealExport()
    {
        // A real export saved mid-entry: row 31 has lithoFrom but no lithoTo.
        var json = File.ReadAllText(Path.Combine("Samples", "GTZO_0001_1.json"));

        var result = UploadDataValidator.Validate(json, TestDocuments.Lookups);

        Assert.Equal(["Row 31: lithoTo is required."], result.Errors);
        Assert.Equal("ZOOVCH", result.Project);
        Assert.Equal("GTZO_0001_1", result.Drillhole);
        Assert.Equal(0, result.TotalRows);
        Assert.Equal("", result.StoredProcedureJson);
    }

    [Fact]
    public void BuildsTheReferenceStoredProcedurePayload()
    {
        var result = UploadDataValidator.Validate(TestDocuments.Valid().ToJsonString(), TestDocuments.Lookups);

        Assert.Equal(TestDocuments.ValidStoredProcedureJson, result.StoredProcedureJson);
    }

    [Fact]
    public void DropsEveryFieldTheProcedureDoesNotStore()
    {
        var document = TestDocuments.Valid();
        document["created_by"] = "CORP\\creator";
        document["extraMetadata"] = "x";
        var row = document["rows"]![0]!.AsObject();
        row["unknownField"] = 7;

        var payload = JsonNode.Parse(UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups).StoredProcedureJson)!;

        Assert.Equal(["project", "drillhole", "rows"], payload.AsObject().Select(p => p.Key));
        Assert.Equal(
            ["lithoFrom", "lithoTo", "lithoCode", "colorCode", "redoxCode", "ca", "om", "omFacies", "py",
             "ox", "sedim", "granulo", "hardness", "lithologyComments"],
            payload["rows"]![0]!.AsObject().Select(p => p.Key));
    }

    [Fact]
    public void ForwardsOmFaciesAndPyExactly()
    {
        var document = TestDocuments.Valid();
        var row = document["rows"]![0]!.AsObject();
        row["omFacies"] = "a";
        row["py"] = "N";

        var payload = JsonNode.Parse(UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups).StoredProcedureJson)!;
        var stored = payload["rows"]![0]!;

        Assert.Equal("a", stored["omFacies"]!.GetValue<string>());
        Assert.Equal("N", stored["py"]!.GetValue<string>());
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

        var payload = JsonNode.Parse(UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups).StoredProcedureJson)!;
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
        var result = UploadDataValidator.Validate(TestDocuments.WithRows(53).ToJsonString(), TestDocuments.Lookups);

        Assert.Empty(result.Errors);
        Assert.Equal(53, result.TotalRows);
    }

    [Fact]
    public void AcceptsEmptyOptionalAttributesAndNumericDepths()
    {
        var document = TestDocuments.Valid();
        document["rows"]!.AsArray().Add(TestDocuments.Row(10, 12.5m));

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Empty(result.Errors);
        Assert.Equal(2, result.TotalRows);
    }

    [Fact]
    public void ThrowsForInvalidJsonSyntax()
    {
        Assert.ThrowsAny<JsonException>(() => UploadDataValidator.Validate("{ \"project\": ", TestDocuments.Lookups));
    }

    [Fact]
    public void RejectsANonObjectRoot()
    {
        var result = UploadDataValidator.Validate("[]", TestDocuments.Lookups);

        Assert.Equal(["The JSON root must be an object."], result.Errors);
    }

    [Theory]
    [InlineData("project")]
    [InlineData("drillhole")]
    public void RejectsAMissingRequiredField(string field)
    {
        var document = TestDocuments.Valid();
        document.Remove(field);

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Equal([$"{field} is required and must be text."], result.Errors);
    }

    [Fact]
    public void RejectsABlankDrillhole()
    {
        var document = TestDocuments.Valid();
        document["drillhole"] = "  ";

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Equal(["drillhole is required and must be text."], result.Errors);
    }

    [Fact]
    public void RejectsADrillholeLongerThanTheHoleParameter()
    {
        var document = TestDocuments.Valid();
        document["drillhole"] = new string('H', 21);

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Equal(["drillhole must be 20 characters or fewer."], result.Errors);
    }

    [Fact]
    public void RejectsMissingRows()
    {
        var document = TestDocuments.Valid();
        document.Remove("rows");

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Equal(["rows is required and must be an array."], result.Errors);
    }

    [Fact]
    public void RejectsEmptyRows()
    {
        var document = TestDocuments.Valid();
        document["rows"] = new JsonArray();

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

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

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

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

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Equal(["Row 1: lithoFrom must be less than lithoTo."], result.Errors);
    }

    [Fact]
    public void RejectsANonTextStoredAttribute()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoCode"] = 3;

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Equal(["Row 1: lithoCode must be a text value."], result.Errors);
    }

    [Fact]
    public void ReportsTheRowNumberOfEachBadRow()
    {
        var document = TestDocuments.Valid();
        var rows = document["rows"]!.AsArray();
        rows.Add(TestDocuments.Row(10, 15));
        rows.Add(TestDocuments.Row(20, 15));

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Equal(["Row 3: lithoFrom must be less than lithoTo."], result.Errors);
    }

    [Fact]
    public void CapsALongErrorList()
    {
        var document = TestDocuments.Valid();
        var rows = new JsonArray();
        for (var i = 0; i < 60; i++)
        {
            rows.Add(TestDocuments.Row(5, 1));
        }
        document["rows"] = rows;

        var result = UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

        Assert.Equal(UploadDataValidator.MaxReportedErrors + 1, result.Errors.Count);
        Assert.Equal("Row 50: lithoFrom must be less than lithoTo.", result.Errors[^2]);
        Assert.Equal("…and 10 more errors.", result.Errors[^1]);
    }

    // ---- Depths ----

    [Theory]
    [InlineData("lithoFrom", "-0.5")]
    [InlineData("lithoFrom", " -1 ")]
    [InlineData("lithoTo", "-10")]
    public void RejectsANegativeDepth(string field, string depth)
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]![field] = depth;

        var result = Validate(document);

        Assert.Contains($"Row 1: {field} must not be negative.", result.Errors);
    }

    [Fact]
    public void RejectsANegativeNumericDepth()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoFrom"] = -2.5m;

        Assert.Equal(["Row 1: lithoFrom must not be negative."], Validate(document).Errors);
    }

    [Fact]
    public void AcceptsADepthOfZero()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoFrom"] = "0";

        Assert.Empty(Validate(document).Errors);
    }

    [Theory]
    [InlineData("12.505")]
    [InlineData("5.001")]
    public void RejectsADepthWithMoreThanTwoDecimals(string lithoFrom)
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoFrom"] = lithoFrom;
        document["rows"]![0]!["lithoTo"] = "20";

        Assert.Equal(["Row 1: lithoFrom must have at most 2 decimal places."], Validate(document).Errors);
    }

    [Fact]
    public void RejectsANumericDepthWithMoreThanTwoDecimals()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoTo"] = 10.125m;

        Assert.Equal(["Row 1: lithoTo must have at most 2 decimal places."], Validate(document).Errors);
    }

    [Theory]
    [InlineData("5.25")]
    [InlineData("5.250")]   // trailing zeros do not change the stored value
    public void AcceptsADepthWithTwoDecimals(string lithoFrom)
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithoFrom"] = lithoFrom;

        Assert.Empty(Validate(document).Errors);
    }

    // ---- Intervals across rows ----

    [Fact]
    public void AcceptsTouchingIntervalsInAnyOrder()
    {
        var document = DocumentWith(("10", "15"), ("5", "10"), ("15", "20.5"));

        var result = Validate(document);

        Assert.Empty(result.Errors);
        Assert.Equal(3, result.TotalRows);
    }

    [Fact]
    public void AcceptsAGapBetweenIntervals()
    {
        Assert.Empty(Validate(DocumentWith(("0", "5"), ("7", "10"))).Errors);
    }

    [Fact]
    public void RejectsOverlappingIntervals()
    {
        var result = Validate(DocumentWith(("0", "5"), ("3", "8")));

        Assert.Equal(["Row 2: interval 3–8 overlaps row 1 (0–5)."], result.Errors);
    }

    [Fact]
    public void RejectsOverlappingIntervalsListedOutOfOrder()
    {
        var result = Validate(DocumentWith(("3", "8"), ("10", "12"), ("0", "5")));

        Assert.Equal(["Row 3: interval 0–5 overlaps row 1 (3–8)."], result.Errors);
    }

    [Fact]
    public void RejectsAnIntervalInsideAnother()
    {
        var result = Validate(DocumentWith(("0", "10"), ("2", "3"), ("4", "5")));

        Assert.Equal(
            ["Row 2: interval 2–3 overlaps row 1 (0–10).", "Row 3: interval 4–5 overlaps row 1 (0–10)."],
            result.Errors);
    }

    [Fact]
    public void RejectsADuplicateFromToPair()
    {
        var result = Validate(DocumentWith(("0", "5"), ("5", "10"), ("0.00", "5.0")));

        Assert.Equal(["Row 3: interval 0.00–5.0 duplicates row 1."], result.Errors);
    }

    [Fact]
    public void ComparesIntervalsEvenWhenOtherRowsHaveErrors()
    {
        var document = DocumentWith(("0", "5"), ("abc", "6"), ("4", "9"));

        var result = Validate(document);

        Assert.Equal(
            ["Row 2: lithoFrom must be a number.", "Row 3: interval 4–9 overlaps row 1 (0–5)."],
            result.Errors);
    }

    // ---- Text lengths ----

    [Fact]
    public void RejectsAProjectLongerThanTheProcedureStores()
    {
        var document = TestDocuments.Valid();
        document["project"] = new string('P', 11);

        Assert.Equal(["project must be 10 characters or fewer."], Validate(document).Errors);
    }

    [Fact]
    public void AcceptsAProjectOfTenCharacters()
    {
        var document = TestDocuments.Valid();
        document["project"] = new string('P', 10);

        Assert.Empty(Validate(document).Errors);
    }

    [Theory]
    [InlineData("lithoCode")]
    [InlineData("colorCode")]
    [InlineData("redoxCode")]
    [InlineData("ca")]
    [InlineData("om")]
    [InlineData("omFacies")]
    [InlineData("py")]
    [InlineData("ox")]
    [InlineData("sedim")]
    [InlineData("granulo")]
    [InlineData("hardness")]
    public void RejectsACodeLongerThanTwentyCharacters(string field)
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]![field] = new string('C', 21);

        Assert.Equal([$"Row 1: {field} must be 20 characters or fewer."], Validate(document).Errors);
    }

    [Fact]
    public void AcceptsTwentyCharacterFreeTextCodes()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["granulo"] = new string('G', 20);
        document["rows"]![0]!["hardness"] = new string('H', 20);

        Assert.Empty(Validate(document).Errors);
    }

    [Fact]
    public void RejectsCommentsLongerThan254Characters()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithologyComments"] = new string('x', 255);

        Assert.Equal(["Row 1: lithologyComments must be 254 characters or fewer."], Validate(document).Errors);
    }

    [Fact]
    public void AcceptsCommentsOf254Characters()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["lithologyComments"] = new string('ш', 254);

        Assert.Empty(Validate(document).Errors);
    }

    // ---- Lookup codes ----

    [Theory]
    [InlineData("lithoCode")]
    [InlineData("colorCode")]
    [InlineData("redoxCode")]
    [InlineData("ca")]
    [InlineData("om")]
    [InlineData("omFacies")]
    [InlineData("py")]
    [InlineData("ox")]
    [InlineData("sedim")]
    public void RejectsAnUnknownLookupCode(string field)
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]![field] = "ZZZ";

        Assert.Equal([$"Row 1: {field} \"ZZZ\" is not a known code."], Validate(document).Errors);
    }

    [Fact]
    public void AcceptsAKnownCodeForEveryLookupField()
    {
        var document = TestDocuments.Valid();
        var row = document["rows"]![0]!;
        row["lithoCode"] = "SS";
        row["ca"] = "1";
        row["om"] = "2";
        row["omFacies"] = "A";
        row["py"] = "N";
        row["ox"] = "Y";
        row["sedim"] = "lam";   // matched case-insensitively, like SQL Server

        Assert.Empty(Validate(document).Errors);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void AcceptsAnEmptyLookupCode(string? code)
    {
        var document = TestDocuments.Valid();
        var row = document["rows"]![0]!.AsObject();
        foreach (var field in UploadLookups.Fields)
        {
            row[field] = code;
        }

        Assert.Empty(Validate(document).Errors);
    }

    [Fact]
    public void AcceptsAMissingLookupCode()
    {
        var document = TestDocuments.Valid();
        var row = document["rows"]![0]!.AsObject();
        foreach (var field in UploadLookups.Fields)
        {
            row.Remove(field);
        }

        Assert.Empty(Validate(document).Errors);
    }

    [Fact]
    public void RejectsAnyCodeWhenItsListIsEmpty()
    {
        var lookups = new UploadLookups(new Dictionary<string, IEnumerable<string?>>());

        var result = UploadDataValidator.Validate(TestDocuments.Valid().ToJsonString(), lookups);

        Assert.Equal(
            ["Row 1: lithoCode \"0--\" is not a known code.",
             "Row 1: colorCode \"10G4/2\" is not a known code.",
             "Row 1: redoxCode \"0042_MN1\" is not a known code."],
            result.Errors);
    }

    [Fact]
    public void RejectsANonTextUnstoredLookupCode()
    {
        var document = TestDocuments.Valid();
        document["rows"]![0]!["py"] = 1;

        Assert.Equal(["Row 1: py must be a text value."], Validate(document).Errors);
    }

    [Fact]
    public void BuildsLookupsFromTheTableConstantsLists()
    {
        var lookups = UploadLookups.From(TableConstantsRepository.Group(
        [
            new("Min1Qty", "1", null), new("Colour", "RED", null), new("LithoFacies", "SS", null),
            new("Min2Qty", "2", null), new("OM_Facies", "A", null), new("Min4Qty", "Y", null),
            new("Min3Qty", "N", null), new("RedoxFacies", "OX", null), new("InternalStructure", "LAM", null)
        ]));

        Assert.True(lookups.IsKnown("ca", "1"));
        Assert.True(lookups.IsKnown("colorCode", "RED"));
        Assert.True(lookups.IsKnown("lithoCode", "SS"));
        Assert.True(lookups.IsKnown("om", "2"));
        Assert.True(lookups.IsKnown("omFacies", "A"));
        Assert.True(lookups.IsKnown("ox", "Y"));
        Assert.True(lookups.IsKnown("py", "N"));
        Assert.True(lookups.IsKnown("redoxCode", "OX"));
        Assert.True(lookups.IsKnown("sedim", "LAM"));
        Assert.False(lookups.IsKnown("ca", "Y"));   // each field reads only its own list
    }

    // ---- Reporting ----

    [Fact]
    public void ReportsEveryErrorInEveryRow()
    {
        var document = DocumentWith(("-1", "5.123"), ("5", "10"), ("10", "8"));
        var rows = document["rows"]!.AsArray();
        rows[1]!["lithoCode"] = "ZZZ";
        rows[1]!["lithologyComments"] = new string('x', 255);
        document["project"] = new string('P', 11);

        var result = Validate(document);

        Assert.Equal(
            ["project must be 10 characters or fewer.",
             "Row 1: lithoFrom must not be negative.",
             "Row 1: lithoTo must have at most 2 decimal places.",
             "Row 2: lithoCode \"ZZZ\" is not a known code.",
             "Row 2: lithologyComments must be 254 characters or fewer.",
             "Row 3: lithoFrom must be less than lithoTo."],
            result.Errors);
        Assert.Equal("", result.StoredProcedureJson);
    }

    private static UploadDataValidator.Result Validate(JsonObject document) =>
        UploadDataValidator.Validate(document.ToJsonString(), TestDocuments.Lookups);

    private static JsonObject DocumentWith(params (string From, string To)[] intervals)
    {
        var document = TestDocuments.Valid();
        document["rows"] = new JsonArray(
            [.. intervals.Select(interval => (JsonNode)TestDocuments.Row(interval.From, interval.To))]);
        return document;
    }
}
