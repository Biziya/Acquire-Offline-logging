import { describe, expect, it } from "vitest";
import type { RawLithoRow, RowField } from "../src/types/domain";
import { createSchemaRow } from "../src/types/rawLithoSchema";
import {
  canonicalizeLookupCodes,
  findConditionalRuleIssues,
  findFirstIncompleteRow,
  hasInvalidLookupValues,
  isValidDepth,
  isValidDepthRange,
  toDepthText,
} from "../src/pages/RawLitho/rawLithoValidation";
import { parseClipboardText } from "../src/pages/RawLitho/rawLithoClipboard";

function row(id: string, from: string, to: string, overrides: Partial<RawLithoRow> = {}) {
  return {
    ...createSchemaRow(id),
    lithoFrom: from,
    lithoTo: to,
    lithoCode: "SS",
    colorCode: "10G4/2",
    redoxCode: "Gr",
    ...overrides,
  };
}

const label = (fieldKey: RowField) => fieldKey;

describe("depth values", () => {
  it.each(["0", "12", "12.5", ".5", "12.", " 7.25 "])("accepts %j", (value) => {
    expect(isValidDepth(value)).toBe(true);
  });

  it.each(["", "abc", "0x1A", "1e3", "+5", "-3", "Infinity", "12,5", "1.2.3"])(
    "rejects %j",
    (value) => {
      expect(isValidDepth(value)).toBe(false);
    },
  );

  it("rejects negative and non-finite numbers", () => {
    expect(isValidDepth(-1)).toBe(false);
    expect(isValidDepth(Number.NaN)).toBe(false);
    expect(isValidDepth(4.5)).toBe(true);
  });

  it("reads a decimal comma from a paste", () => {
    expect(toDepthText("12,5")).toBe("12.5");
    expect(toDepthText(" 3 ")).toBe("3");
    expect(toDepthText("1,234,5")).toBeNull();
    expect(toDepthText("abc")).toBeNull();
  });

  it("does not count a zero-length interval as finished", () => {
    expect(isValidDepthRange(row("a", "12", "12"))).toBe(false);
    expect(isValidDepthRange(row("a", "12", "12.5"))).toBe(true);
  });
});

describe("Save JSON checks", () => {
  it("finds an empty required cell, a bad depth and From >= To, in table order", () => {
    expect(findFirstIncompleteRow([row("a", "0", "5"), row("b", "5", "")], label)).toEqual({
      rowIndex: 1,
      message: "lithoTo is empty.",
    });
    expect(findFirstIncompleteRow([row("a", "0x1A", "30")], label)).toEqual({
      rowIndex: 0,
      message: "lithoFrom is not a valid depth.",
    });
    expect(findFirstIncompleteRow([row("a", "80", "60")], label)).toEqual({
      rowIndex: 0,
      message: "From must be less than To.",
    });
    expect(findFirstIncompleteRow([row("a", "5", "5")], label)?.message).toBe(
      "From must be less than To.",
    );
    expect(findFirstIncompleteRow([row("a", "0", "5"), row("b", "5", "9")], label)).toBeNull();
  });

  it("skips a lookup list that could not be loaded, like import", () => {
    const rows = [row("a", "0", "5", { colorCode: "10G4/2" })];
    expect(hasInvalidLookupValues(rows, {}, { skipUnavailable: true })).toBe(false);
  });
});

describe("imported lookup codes", () => {
  it("are stored as their list spells them, so the conditional rules apply", () => {
    const lookupData = { lithoCode: [{ lithoCode: "01M" }, { lithoCode: "SS" }] };
    const imported = [row("a", "0", "5", { lithoCode: "01m" }), row("b", "5", "9")];

    const [first, second] = canonicalizeLookupCodes(imported, lookupData);
    expect(first?.lithoCode).toBe("01M");
    expect(findConditionalRuleIssues(first!).map((issue) => issue.field)).toEqual(["omFacies"]);
    // Unchanged rows keep their identity; unknown codes are left alone.
    expect(second).toBe(imported[1]);
    expect(canonicalizeLookupCodes([row("c", "0", "1", { lithoCode: "zz" })], lookupData)[0]?.lithoCode).toBe("zz");
  });
});

describe("Excel clipboard text", () => {
  it("keeps a quoted cell with a line break as one value", () => {
    expect(parseClipboardText('1\t2\t"fine sand\nclay"\r\n3\t4\tsilt\r\n')).toEqual([
      ["1", "2", "fine sand\nclay"],
      ["3", "4", "silt"],
    ]);
  });

  it("reads doubled quotes inside a quoted cell", () => {
    expect(parseClipboardText('"a ""b"""\tc')).toEqual([['a "b"', "c"]]);
  });

  it("keeps a quote that does not start a cell, or is never closed, as text", () => {
    expect(parseClipboardText('5" core\tx')).toEqual([['5" core', "x"]]);
    expect(parseClipboardText('"open\tx')).toEqual([['"open', "x"]]);
  });

  it("still reads plain ranges and a single value", () => {
    expect(parseClipboardText("a\t\tb\n")).toEqual([["a", "", "b"]]);
    expect(parseClipboardText("text")).toEqual([["text"]]);
    expect(parseClipboardText("")).toEqual([[""]]);
  });
});
