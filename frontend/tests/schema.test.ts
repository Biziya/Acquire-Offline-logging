import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { columnByKey, columns, createSchemaRow } from "../src/types/rawLithoSchema";
import { tableColumns } from "../src/pages/RawLitho/constants";
import { addDocumentRow, createBlankDocument } from "../src/pages/RawLitho/rawLithoDocumentOperations";
import { parseStoredHoleIds } from "../src/services/IndexDB/recentDrillholesDb";
import { normalizeRecentHoleIds } from "../src/pages/RawLitho/drillholeOrdering";

describe("complete column schema", () => {
  it("creates all 20 persisted fields while retaining the existing visible order", () => {
    const row = createSchemaRow("stable");
    expect(columns).toHaveLength(20);
    expect(Object.keys(row)).toEqual(["id", ...columns.map(column => column.key)]);
    expect(columns.every(column => row[column.key] === column.defaultValue)).toBe(true);
    expect(row).toMatchObject({ extractionType: "", corePass: "", recoveryStart: "", recoveryEnd: "", coreEnd: "", lithologicalDescription: "" });
    expect(tableColumns.map(column => column.key)).toEqual(["lithoFrom", "lithoTo", "lithoCode", "colorCode", "ca", "om", "omFacies", "py", "ox", "sedim", "redoxCode", "lithologyComments", "granulo", "hardness"]);
    expect(Object.entries(columnByKey).every(([key, column]) => key === column.key)).toBe(true);
  });

  it("rejects schema typos, missing definitions/defaults, mismatched keys and unsupported input types at compile time", () => {
    const schema = readFileSync(resolve("src/types/rawLithoSchema.ts"), "utf8");
    const variants = [
      schema,
      schema.replace(/extractionType:\s*\{[\s\S]*?\},/, ""),
      schema.replace(/extractionType:\s*\{/, "lithoForm: {"),
      schema.replace('key: "extractionType"', 'key: "corePass"'),
      schema.replace(/defaultValue:\s*""\s*,?/, ""),
      schema.replace('type: "text",', 'type: "date",'),
      schema.replace('| "extractionType"', '| "newField" | "extractionType"'),
    ];
    const files = new Map(variants.map((source, index) => [resolve(`schema-probe-${index}.ts`), source]));
    const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, strict: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: true, types: [] };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile;
    host.getSourceFile = (fileName, languageVersion, onError, createNew) => {
      const source = files.get(fileName);
      return source === undefined ? original(fileName, languageVersion, onError, createNew) : ts.createSourceFile(fileName, source, languageVersion, true);
    };
    const program = ts.createProgram([...files.keys()], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics.filter(item => item.file?.fileName === resolve("schema-probe-0.ts"))).toEqual([]);
    for (let index = 1; index < variants.length; index += 1) {
      expect(diagnostics.some(item => item.file?.fileName === resolve(`schema-probe-${index}.ts`)), `probe ${index} must fail compilation`).toBe(true);
    }
  });

  it("handles an empty rows array without inventing an accepted previous row", () => {
    const draft = { ...createBlankDocument(), rows: [] };
    expect(addDocumentRow(draft)).toMatchObject({ document: draft, result: { created: false, focusField: "lithoFrom" }, issue: { issue: "missingRequiredFields" } });
  });

  it("parses unknown recent-hole storage separately from typed ordering", () => {
    expect(parseStoredHoleIds(null)).toEqual([]);
    expect(parseStoredHoleIds(["A", null, 3, "", "B", "A"])).toEqual(["A", "B"]);
    expect(normalizeRecentHoleIds([" A ", "B", "A", "C", "D"])).toEqual(["A", "B", "C"]);
  });
});
