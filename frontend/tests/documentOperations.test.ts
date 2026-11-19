import { describe, expect, it, vi } from "vitest";
import { createSchemaRow } from "../src/types/rawLithoSchema";
import {
  addDocumentRow,
  commitDepth,
  createBlankDocument,
  editRow,
  clearDocumentCells,
  removeDocumentLastRow,
  removeDocumentRows,
  sortDocument,
} from "../src/pages/RawLitho/rawLithoDocumentOperations";
import {
  normalizeRawLithoDocument,
  exportRawLithoSnapshot,
  readRawLithoImport,
} from "../src/pages/RawLitho/rawLithoHelpers";
import { findOverlappingIntervalRowIds, overlapsAnotherInterval } from "../src/pages/RawLitho/rawLithoValidation";
import {
  hasWorkingData,
  orderDrillholes,
  pickRecentWorkingHoleIds,
} from "../src/pages/RawLitho/drillholeOrdering";

const complete = () => ({
  ...createBlankDocument({ drillhole: "A" }),
  rows: [
    {
      ...createSchemaRow("legacy-id"),
      lithoFrom: "10",
      lithoTo: "15",
      lithoCode: "L",
      colorCode: "C",
      redoxCode: "R",
      ox: "O",
    },
  ],
});
describe("document operations", () => {
  it("exports normalized comments from legacy records while preserving internal and trailing spaces", async () => {
    const document = complete();
    document.rows[0]!.lithologyComments = " \t  Fine  sandstone ";
    document.rows[0]!.lithologicalDescription = "  unchanged ";
    let exported: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => { exported = blob; return "blob:test"; },
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      exportRawLithoSnapshot(document);
      const json = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(exported!);
      });
      expect(JSON.parse(json).rows[0]).toMatchObject({
        lithologyComments: "Fine  sandstone ", lithologicalDescription: "  unchanged ",
      });
      expect(document.rows[0]!.lithologyComments).toBe(" \t  Fine  sandstone ");
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("normalizes whitespace-only comment edits to empty without changing the document", () => {
    const document = complete();
    expect(editRow(document, "legacy-id", "lithologyComments", " \t ")).toBe(document);
  });
  it("requires all five required fields and focuses the first missing field", () => {
    let document = createBlankDocument();
    for (const field of [
      "lithoFrom",
      "lithoTo",
      "lithoCode",
      "colorCode",
      "redoxCode",
    ] as const) {
      expect(addDocumentRow(document).result).toMatchObject({
        created: false,
        focusField: field,
      });
      document = editRow(
        document,
        1,
        field,
        field === "lithoFrom" ? "0" : field === "lithoTo" ? "10" : "Unknown",
      );
    }
    expect(addDocumentRow(document).result.created).toBe(true);
  });
  it("copies previous values, leaves the new end depth blank, and preserves existing IDs", () => {
    const source = complete();
    const { document, result } = addDocumentRow(source);
    expect(result.created).toBe(true);
    expect(document.rows[0]?.id).toBe("legacy-id");
    expect(document.rows[1]).toMatchObject({
      lithoFrom: "15",
      lithoTo: "",
      lithoCode: "L",
      colorCode: "C",
      redoxCode: "R",
      ox: "O",
    });
    expect(source.rows).toHaveLength(1);
  });
  it("rejects inverted and duplicate intervals", () => {
    const source = complete();
    expect(
      addDocumentRow(editRow(source, "legacy-id", "lithoTo", "9")).issue?.issue,
    ).toBe("invalidDepthRange");
    const first = source.rows[0];
    if (!first) throw new Error("Expected the complete fixture row.");
    source.rows.push({ ...first, id: "second", lithoFrom: "10.0" });
    expect(addDocumentRow(source).issue?.issue).toBe("overlappingInterval");
    expect(findOverlappingIntervalRowIds(source.rows)).toEqual(
      new Set(["legacy-id", "second"]),
    );
  });
  it("reverts an invalid committed depth, then sorts whole rows by depth", () => {
    const source = complete();
    const edited = editRow(source, "legacy-id", "lithoFrom", "20");
    const result = commitDepth(edited, "legacy-id", "lithoFrom", "10");
    expect(result.reverted).toBe(true);
    expect(result.document.rows[0]?.lithoFrom).toBe("10");
    source.rows.push({
      ...createSchemaRow("shallow"),
      lithoFrom: "2",
      lithoTo: "8",
    });
    expect(sortDocument(source).rows.map((row) => row.id)).toEqual([
      "shallow",
      "legacy-id",
    ]);
    expect(sortDocument(sortDocument(source)).rows[0]?.id).toBe("shallow");
  });
  it("deletes only the last row and keeps a minimum of one", () => {
    const single = complete();
    expect(removeDocumentLastRow(single)).toBe(single);
    const two = addDocumentRow(single).document;
    expect(removeDocumentLastRow(two).rows).toEqual(single.rows);
    expect(two.rows).toHaveLength(2);
  });
  it("normalizes legacy documents without losing string IDs and repairs duplicates", () => {
    const legacy = {
      holeId: "A",
      projectCode: "P",
      rows: [
        { id: "old-id", lithoFrom: 10 },
        { id: "old-id", lithoTo: 12 },
      ],
    };
    const document = normalizeRawLithoDocument(legacy);
    expect(document).toMatchObject({ drillhole: "A", project: "P" });
    expect(document.rows[0]).toMatchObject({ id: "old-id", lithoFrom: "10" });
    expect(document.rows[1]?.id).toBeDefined();
    expect(document.rows[1]?.id).not.toBe("old-id");
    expect(normalizeRawLithoDocument(document)).toEqual(document);
  });
  it("validates imported JSON at runtime and preserves the exported structure", async () => {
    const source = complete();
    const file = new File([], "a.json");
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(source),
    });
    expect(Object.keys(await readRawLithoImport(file))).toEqual([
      "project",
      "campaign",
      "drillhole",
      "created_at",
      "modified_at",
      "rows",
    ]);
    const invalid = new File([], "bad.json");
    Object.defineProperty(invalid, "text", {
      value: async () => '{"rows":{}}',
    });
    await expect(readRawLithoImport(invalid)).rejects.toThrow();
  });
  it("puts three recent drillholes before the remaining newest-first drillholes", () => {
    const holes = ["A", "B", "C", "D", "E"].map((holeId) => ({
      holeId,
      projectCode: "P",
      campaign: "C",
    }));
    const ordered = orderDrillholes(holes, ["B", "A", "C", "D"]);
    expect(ordered.drillholes.map((hole) => hole.holeId)).toEqual(["B", "A", "C", "E", "D"]);
    expect(ordered.recentCount).toBe(3);

    // A recent hole missing from the list is skipped, never invented.
    const missing = orderDrillholes(holes, ["X", "B"]);
    expect(missing.drillholes.map((hole) => hole.holeId)).toEqual(["B", "E", "D", "C", "A"]);
    expect(missing.recentCount).toBe(1);
  });

  it("promotes only drillholes with saved data, most recently worked on first", () => {
    const drafts = new Map([
      ["A", "2026-10-01T00:00:00.000Z"],
      ["B", "2026-10-03T00:00:00.000Z"],
      ["C", "2026-10-02T00:00:00.000Z"],
      ["D", "2026-10-04T00:00:00.000Z"],
    ]);

    // Selection history first (X has no draft, so it does not count), then
    // the other drafts by last edit; never more than three.
    expect(pickRecentWorkingHoleIds(["X", "C", "A"], drafts)).toEqual(["C", "A", "D"]);
    expect(pickRecentWorkingHoleIds([], drafts)).toEqual(["D", "B", "C"]);
    expect(pickRecentWorkingHoleIds(["X", "Y"], new Map())).toEqual([]);
  });

  it("counts a draft as working data only when a row holds a value", () => {
    expect(hasWorkingData(createBlankDocument({ drillhole: "A" }))).toBe(false);
    expect(hasWorkingData({ rows: [{ ...createSchemaRow(1), lithoFrom: "  " }] })).toBe(false);
    expect(hasWorkingData({ rows: [{ ...createSchemaRow(1), lithoCode: "SS" }] })).toBe(true);
    expect(hasWorkingData(null)).toBe(false);
    expect(hasWorkingData({ rows: "broken" })).toBe(false);
  });
});

describe("interval overlap", () => {
  const interval = (id: string, from: string, to: string) => ({
    ...createSchemaRow(id),
    lithoFrom: from,
    lithoTo: to,
  });

  it("flags intersecting and identical intervals, allows touching ends", () => {
    const rows = [
      interval("a", "0", "10"),
      interval("b", "10", "20"), // touches a: fine
      interval("c", "15", "18"), // inside b
      interval("d", "30", "40"),
      interval("e", "30", "40"), // identical to d
      interval("f", "50", ""), // incomplete: never flagged
      interval("g", "45", "50"), // touches f's From only
    ];
    expect(findOverlappingIntervalRowIds(rows)).toEqual(new Set(["b", "c", "d", "e"]));
    expect(overlapsAnotherInterval(interval("x", "5", "12"), rows)).toBe(true);
    expect(overlapsAnotherInterval(interval("x", "20", "30"), rows)).toBe(false);
  });

  it("finds an interval that contains a later one even past a shorter row", () => {
    const rows = [interval("long", "0", "100"), interval("a", "1", "2"), interval("b", "50", "60")];
    expect(findOverlappingIntervalRowIds(rows)).toEqual(new Set(["long", "a", "b"]));
  });

  it("refuses to add a row after an overlapping last row", () => {
    const source = complete();
    const first = source.rows[0]!;
    source.rows.push({ ...first, id: "second", lithoFrom: "12", lithoTo: "20" });
    expect(addDocumentRow(source).issue?.issue).toBe("overlappingInterval");
  });
});

describe("bulk delete", () => {
  const rows = (...ids: string[]) =>
    ids.map((id, index) => ({
      ...createSchemaRow(id),
      lithoFrom: String(index * 10),
      lithoTo: String(index * 10 + 10),
      lithoCode: "L",
    }));

  it("removes only the ticked rows", () => {
    const source = { ...createBlankDocument({ drillhole: "A" }), rows: rows("1", "2", "3") };
    expect(removeDocumentRows(source, ["1", 3]).rows.map((row) => row.id)).toEqual(["2"]);
    expect(removeDocumentRows(source, ["nope"])).toBe(source);
  });

  it("leaves one blank row when every row is deleted", () => {
    const source = { ...createBlankDocument({ drillhole: "A" }), rows: rows("1", "2") };
    const next = removeDocumentRows(source, ["1", "2"]);
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]).toMatchObject({ lithoFrom: "", lithoTo: "", lithoCode: "" });
  });

  it("clears selected cells, including required ones, and keeps the rows", () => {
    const source = { ...createBlankDocument({ drillhole: "A" }), rows: rows("1", "2") };
    const next = clearDocumentCells(source, [
      { rowId: "1", columnKey: "lithoCode" },
      { rowId: "2", columnKey: "lithoCode" },
      { rowId: "2", columnKey: "lithoTo" },
    ]);
    expect(next.rows.map((row) => [row.id, row.lithoCode, row.lithoTo])).toEqual([
      ["1", "", "10"],
      ["2", "", ""],
    ]);
    expect(clearDocumentCells(next, [{ rowId: "1", columnKey: "lithoCode" }])).toBe(next);
  });
});
