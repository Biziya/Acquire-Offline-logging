import { describe, expect, it } from "vitest";
import { createEmptyRow } from "../src/pages/RawLitho/constants";
import {
  addDocumentRow,
  commitDepth,
  createBlankDocument,
  editRow,
  removeDocumentLastRow,
  sortDocument,
} from "../src/pages/RawLitho/rawLithoDocumentOperations";
import {
  normalizeRawLithoDocument,
  readRawLithoImport,
} from "../src/pages/RawLitho/rawLithoHelpers";
import { findDuplicateIntervalRowIds } from "../src/pages/RawLitho/rawLithoValidation";
import { orderDrillholes } from "../src/pages/RawLitho/drillholeOrdering";

const complete = () => ({
  ...createBlankDocument({ drillhole: "A" }),
  rows: [
    {
      ...createEmptyRow("legacy-id"),
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
    expect(addDocumentRow(source).issue?.issue).toBe("duplicateInterval");
    expect(findDuplicateIntervalRowIds(source.rows)).toEqual(
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
      ...createEmptyRow("shallow"),
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
  it("puts three recent selections before the remaining newest-first drillholes", () => {
    const holes = ["A", "B", "C", "D", "E"].map((holeId) => ({
      holeId,
      projectCode: "P",
      campaign: "C",
    }));
    expect(
      orderDrillholes(holes, ["B", "A", "C", "D"]).map((hole) => hole.holeId),
    ).toEqual(["B", "A", "C", "E", "D"]);
  });
});
