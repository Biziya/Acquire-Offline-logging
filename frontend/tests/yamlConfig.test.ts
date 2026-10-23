import { describe, expect, it } from "vitest";
import rawLithoText from "../src/pages/RawLitho/config.yaml?raw";
import uploadDataText from "../src/pages/UploadData/config.yaml?raw";
import databaseViewerText from "../src/pages/DatabaseViewer/config.yaml?raw";
import { rawLithoConfig, readRawLithoConfig } from "../src/pages/RawLitho/config";
import { readUploadDataConfig } from "../src/pages/UploadData/config";
import { readDatabaseViewerConfig } from "../src/pages/DatabaseViewer/config";
import {
  INDEX_COLUMN_WIDTH,
  RAW_LITHO_ROWS_PER_PAGE,
  tableColumns,
} from "../src/pages/RawLitho/constants";
import { toPercentWidths } from "../src/components/dataTableStyles";

describe("YAML page configuration", () => {
  it("loads the shipped files with the previous defaults", () => {
    expect(rawLithoConfig.title).toBe("Raw Litho");
    expect(RAW_LITHO_ROWS_PER_PAGE).toBe(50);
    expect(tableColumns.map((column) => column.key)).toEqual([
      "lithoFrom", "lithoTo", "lithoCode", "colorCode", "ca", "om", "omFacies",
      "py", "ox", "sedim", "redoxCode", "lithologyComments", "granulo", "hardness",
    ]);
    expect(readUploadDataConfig(uploadDataText)).toMatchObject({
      rowHeight: 28,
      overscan: 10,
    });
    expect(readDatabaseViewerConfig(databaseViewerText)).toEqual({
      title: "Database Viewer",
      overscan: 12,
    });
  });

  it("controls column visibility, labels and row settings", () => {
    const text = uploadDataText
      .replace('lithoCode: { label: "Litho Code", width: 79, visible: true }',
        'lithoCode: { label: "Code", width: 79, visible: false }')
      .replace("rowHeight: 28", "rowHeight: 40");
    const config = readUploadDataConfig(text);
    expect(config.rowHeight).toBe(40);
    expect(config.columns.some((column) => column.key === "lithoCode")).toBe(false);
  });

  it.each([
    ["invalid YAML", (text: string) => `${text}\n  : [`, /invalid YAML/],
    ["a non-positive row height", (text: string) => text.replace("rowHeight: 22", "rowHeight: 0"), /table\.rowHeight must be a whole number/],
    ["an unknown column", (text: string) => text.replace("lithoFrom:", "lithoFromm:"), /lithoFromm is not a known column/],
    ["a missing persisted field", (text: string) => text.replace(/^\s*coreEnd:.*$/m, ""), /table\.columns is missing coreEnd/],
    ["a wrong type", (text: string) => text.replace('title: "Raw Litho"', "title: 5"), /title must be a non-empty string/],
  ])("rejects %s with the file and key", (_, mutate, message) => {
    expect(() => readRawLithoConfig(mutate(rawLithoText))).toThrow(message);
  });

  it("turns configured widths into percentages that fill the table", () => {
    expect(toPercentWidths([34, 66, 100])).toEqual(["17.000%", "33.000%", "50.000%"]);
    const total = [INDEX_COLUMN_WIDTH, ...tableColumns.map((column) => column.width)]
      .map((width) => {
        expect(width).toMatch(/^\d+(\.\d+)?%$/);
        return Number.parseFloat(width);
      })
      .reduce((sum, width) => sum + width, 0);
    expect(total).toBeCloseTo(100, 1);
    // The table may shrink well below its old 971 px design width.
    expect(rawLithoConfig.minWidth).toBeLessThan(971);
  });

  it("requires a width for every visible column", () => {
    expect(() =>
      readRawLithoConfig(
        rawLithoText.replace(
          'lithologyComments: { label: "Lithology Comments", width: 170, visible: true }',
          'lithologyComments: { label: "Lithology Comments", visible: true }',
        ),
      ),
    ).toThrow(/lithologyComments\.width must be a whole number/);
  });

  it("requires a whole-number Database Viewer overscan", () => {
    expect(() =>
      readDatabaseViewerConfig(
        databaseViewerText.replace("overscan: 12", "overscan: lots"),
      ),
    ).toThrow(/table\.overscan/);
  });
});
