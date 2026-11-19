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
