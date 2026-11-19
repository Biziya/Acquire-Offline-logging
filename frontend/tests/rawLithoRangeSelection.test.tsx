import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Toast from "../src/components/Toast";
import { uiConfig } from "../src/config/uiConfig";
import {
  formatRowNumbers,
  getFullySelectedRowIds,
  getRowCells,
  getRowRange,
  mergeCells,
} from "../src/pages/RawLitho/rawLithoClipboard";
import { tableColumns } from "../src/pages/RawLitho/constants";
import {
  countLabel,
  getCellRange,
  getCellRefFromElement,
  getFullySelectedRowIds as getSharedFullRows,
} from "../src/components/dataTable/tableSelection";
import { createSchemaRow } from "../src/types/rawLithoSchema";

const rows = ["a", "b", "c", "d"].map((id) => createSchemaRow(id));

describe("selection helpers", () => {
  it("gives every cell of the rows between two rows, in either direction", () => {
    const range = getRowRange(rows, "c", "a");
    expect(new Set(range.map((cell) => cell.rowId))).toEqual(new Set(["a", "b", "c"]));
    expect(range).toHaveLength(3 * tableColumns.length);
    expect(getRowRange(rows, "a", "missing")).toEqual([]);
  });

  it("finds rows whose every visible cell is selected", () => {
    const partial = getRowCells("d").slice(1);
    expect(getFullySelectedRowIds(rows, [...getRowCells("b"), ...partial])).toEqual(["b"]);
  });

  it("merges cells without duplicates", () => {
    const merged = mergeCells(getRowCells("a"), [...getRowCells("a"), ...getRowCells("b")]);
    expect(merged).toHaveLength(2 * tableColumns.length);
  });

  it("writes row numbers as short ranges", () => {
    expect(formatRowNumbers([9, 4, 5, 6, 12, 13])).toBe("4–6, 9, 12–13");
    expect(formatRowNumbers([3])).toBe("3");
    expect(formatRowNumbers([])).toBe("");
  });
});

describe("toast action", () => {
  afterEach(() => vi.useRealTimers());

  it("runs the action, closes, and stays at least the action duration", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onClick = vi.fn();
    render(
      <Toast message="2 rows deleted" type="success" onClose={onClose} action={{ label: "Undo", onClick }} />,
    );

    act(() => vi.advanceTimersByTime(uiConfig.toastActionDuration - 100));
    expect(onClose).not.toHaveBeenCalled();

    act(() => screen.getByRole("button", { name: "Undo" }).click());
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("shared table selection (Upload Data uses it with record indices)", () => {
  const ids = ["0", "1", "2", "3"];
  const keys = ["a", "b", "c"] as const;

  it("gives a rectangle in display order, whichever corner comes first", () => {
    const range = getCellRange(ids, keys, { rowId: "2", columnKey: "c" }, { rowId: "1", columnKey: "b" });
    expect(range).toEqual([
      { rowId: "1", columnKey: "b" },
      { rowId: "1", columnKey: "c" },
      { rowId: "2", columnKey: "b" },
      { rowId: "2", columnKey: "c" },
    ]);
    expect(getCellRange(ids, keys, { rowId: "9", columnKey: "a" }, { rowId: "1", columnKey: "a" })).toEqual([]);
  });

  it("knows whole rows, reads cells from the DOM contract, and counts", () => {
    const selection = [
      ...["a", "b", "c"].map((columnKey) => ({ rowId: "3", columnKey })),
      { rowId: "0", columnKey: "a" },
    ];
    expect(getSharedFullRows(ids, keys, selection)).toEqual(["3"]);

    document.body.innerHTML =
      '<table><tbody><tr data-row-id="7"><td data-column="b"><input /></td><td data-row-number></td></tr></tbody></table>';
    expect(getCellRefFromElement(document.querySelector("input"), keys)).toEqual({ rowId: "7", columnKey: "b" });
    expect(getCellRefFromElement(document.querySelector("[data-row-number]"), keys)).toBeNull();
    document.body.innerHTML = "";

    expect(countLabel(1, "record")).toBe("1 record");
    expect(countLabel(2000, "row")).toBe("2000 rows");
  });
});
