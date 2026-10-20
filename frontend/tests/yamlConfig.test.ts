import { describe, expect, it } from "vitest";
import rawLithoText from "../src/pages/RawLitho/config.yaml?raw";
import uploadDataText from "../src/pages/UploadData/config.yaml?raw";
import databaseViewerText from "../src/pages/DatabaseViewer/config.yaml?raw";
import { rawLithoConfig, readRawLithoConfig } from "../src/pages/RawLitho/config";
import { readUploadDataConfig } from "../src/pages/UploadData/config";
import { readDatabaseViewerConfig } from "../src/pages/DatabaseViewer/config";
import { RAW_LITHO_ROWS_PER_PAGE, tableColumns } from "../src/pages/RawLitho/constants";

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
    expect(readDatabaseViewerConfig(databaseViewerText).mockData.sizes).toEqual([
      10000, 50000, 100000,
    ]);
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

  it("requires the default mock size to be one of the offered sizes", () => {
    expect(() =>
      readDatabaseViewerConfig(
        databaseViewerText.replace("defaultSize: 10000", "defaultSize: 123"),
      ),
    ).toThrow(/mockData\.defaultSize must be one of mockData\.sizes/);
  });
});
