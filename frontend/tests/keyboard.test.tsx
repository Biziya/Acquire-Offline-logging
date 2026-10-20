import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RawLithoDocument } from "../src/types/domain";
import LookupAutocomplete from "../src/pages/RawLitho/LookupAutocomplete";
import RawLithoTable from "../src/pages/RawLitho/RawLithoTable";
import ConfirmDialog from "../src/pages/RawLitho/ConfirmDialog";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import { useRemoveRowConfirmation } from "../src/pages/RawLitho/hooks/useRemoveRowConfirmation";
import {
  TOAST_NOTIFICATIONS,
  createEmptyRow,
} from "../src/pages/RawLitho/constants";
import {
  createRawLithoDocument,
  normalizeRawLithoDocument,
} from "../src/pages/RawLitho/rawLithoHelpers";
import {
  buildClipboardText,
  parseClipboardText,
} from "../src/pages/RawLitho/rawLithoClipboard";
import {
  readRawLithoDraft,
  writeRawLithoDraft,
} from "../src/services/IndexDB/rawLithoDraftDb";
import {
  focusCellInRow,
  getRowIdFromElement,
} from "../src/pages/RawLitho/tableNavigation";

function AutocompleteHarness({
  onChange = () => {},
}: {
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input aria-label="Before" />
          </td>
          <td>
            <LookupAutocomplete
              rowIndex={0}
              lookup={{
                fieldKey: "lithoCode",
                codeProperty: "code",
                label: "Litho",
              }}
              records={[{ code: "Unknown" }, { code: "Other" }]}
              value={value}
              onValueChange={(next) => {
                setValue(next);
                onChange(next);
              }}
              isPageEnabled
              isLoading={false}
              error=""
            />
          </td>
          <td>
            <input aria-label="After" />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
describe("autocomplete and focus", () => {
  it.each([
    ["ArrowRight", "After"],
    ["ArrowLeft", "Before"],
  ])("accepts a partial match with %s and focuses %s", async (key, label) => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Unk");
    expect(screen.getByRole("option", { name: "Unknown" })).toHaveClass(
      "raw-litho-lookup-suggestion--active",
    );
    await user.keyboard(`{${key}}`);
    expect(input).toHaveValue("Unknown");
    expect(change).toHaveBeenLastCalledWith("Unknown");
    expect(screen.getByLabelText(label)).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
  });
  it("preserves Enter, Tab, and mouse selection", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AutocompleteHarness />);
    await user.type(screen.getByRole("combobox"), "Unk{Enter}");
    expect(screen.getByRole("combobox")).toHaveValue("Unknown");
    unmount();
    const second = render(<AutocompleteHarness />);
    await user.type(screen.getByRole("combobox"), "Unknown");
    await user.tab();
    expect(screen.getByLabelText("After")).toHaveFocus();
    expect(screen.getByRole("combobox")).toHaveValue("Unknown");
    second.unmount();
    render(<AutocompleteHarness />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Other" }));
    expect(screen.getByRole("combobox")).toHaveValue("Other");
  });
  it("does not accept an unmatched query or change dropdown selection with vertical arrows", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    await user.type(screen.getByRole("combobox"), "ZZZ");
    await user.keyboard("{ArrowRight}");
    expect(change).not.toHaveBeenCalled();
    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "Unk");
    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Unknown" })).toHaveClass(
      "raw-litho-lookup-suggestion--active",
    );
  });
  it("can focus a restored string row ID containing selector punctuation", () => {
    const id = 'row-"quoted"';
    const { container } = render(
      <table>
        <tbody>
          <tr data-row-id={id}>
            <td data-column="lithoFrom">
              <input aria-label="Depth" />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    expect(
      focusCellInRow(container.querySelector("tbody"), id, "lithoFrom"),
    ).toBe(true);
    expect(getRowIdFromElement(screen.getByLabelText("Depth"))).toBe(id);
    expect(screen.getByLabelText("Depth")).toHaveFocus();
  });
});

const toast = vi.fn();
function TableHarness() {
  const workspace = useRawLithoWorkspace({
    drillholes: [{ holeId: "KEYBOARD", campaign: "C", projectCode: "P" }],
    showToast: toast,
  });
  const removal = useRemoveRowConfirmation({
    onRemoveLastRow: workspace.removeLastRow,
    showToast: () => {},
  });
  return (
    <>
      <button onClick={() => workspace.selectDrillhole("KEYBOARD")}>
        Select
      </button>
      <RawLithoTable
        rows={workspace.rows}
        currentPage={workspace.currentPage}
        totalPages={workspace.totalPages}
        onPageChange={workspace.changeTablePage}
        lookupData={{
          lithoCode: [{ lithoCode: "Unknown" }],
          colorCode: [{ colourCode: "Unknown" }],
          redoxCode: [{ redoxCode: "Unknown" }],
        }}
        lookupStatus={{}}
        onRowChange={workspace.updateRow}
        onDepthCommit={workspace.commitDepthEdit}
        onPasteCells={workspace.pasteCells}
        showToast={toast}
        onAddRow={workspace.tryAddRow}
        onRemoveLastRow={removal.requestRemoveLastRow}
        isEnabled={workspace.isPageEnabled}
        isBlocked={removal.isConfirmOpen}
      />
      {removal.isConfirmOpen && (
        <ConfirmDialog
          title="Remove last row?"
          message="This row will be deleted."
          confirmLabel="Remove"
          onConfirm={removal.confirmRemoveLastRow}
          onCancel={removal.cancelRemoveLastRow}
          isBusy={removal.isRemoving}
        />
      )}
    </>
  );
}
function validRow(id: string, from: number, to: number) {
  return {
    ...createEmptyRow(id),
    lithoFrom: String(from),
    lithoTo: String(to),
    lithoCode: "Unknown",
    colorCode: "Unknown",
    redoxCode: "Unknown",
  };
}
async function table(rows = [validRow("initial", 10, 20)]) {
  toast.mockClear();
  await writeRawLithoDraft(
    "KEYBOARD",
    createRawLithoDocument({ drillhole: "KEYBOARD", rows }),
  );
  const user = userEvent.setup();
  render(<TableHarness />);
  await user.click(screen.getByText("Select"));
  await waitFor(() =>
    expect(screen.getByLabelText("Litho From (m), row 1")).toBeEnabled(),
  );
  return user;
}
describe("table shortcuts", () => {
  it("adds with ArrowDown from a dropdown and focuses the new row", async () => {
    const user = await table();
    await user.click(screen.getByLabelText("Litho Code, row 1"));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByLabelText("Litho From (m), row 2")).toHaveValue(20);
    await waitFor(() =>
      expect(screen.getByLabelText("Litho From (m), row 2")).toHaveFocus(),
    );
  });
  it("adds with F4, validates the next row, and confirms F5 deletion", async () => {
    const user = await table();
    await user.keyboard("{F4}");
    expect(screen.getByLabelText("Litho To (m), row 2")).toHaveValue(null);
    await user.keyboard("{F4}");
    expect(screen.getByLabelText("Litho To (m), row 2")).toHaveFocus();
    expect(
      screen.queryByLabelText("Litho From (m), row 3"),
    ).not.toBeInTheDocument();
    await user.keyboard("{F5}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Litho From (m), row 2")).toBeInTheDocument();
    await user.click(screen.getByText("Cancel"));
    expect(screen.getByLabelText("Litho From (m), row 2")).toBeInTheDocument();
    await user.keyboard("{F5}");
    await user.click(screen.getByRole("button", { name: /^Remove$/ }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByLabelText("Litho From (m), row 2"),
    ).not.toBeInTheDocument();
  });
  it("clears a numeric cell with Delete and sorts on committed depth edits", async () => {
    const user = await table();
    await user.keyboard("{F4}");
    const from = screen.getByLabelText("Litho From (m), row 2");
    fireEvent.change(from, { target: { value: "5" } });
    fireEvent.keyDown(from, { key: "Enter" });
    expect(screen.getByLabelText("Litho From (m), row 1")).toHaveValue(5);
    await user.click(screen.getByLabelText("Litho From (m), row 1"));
    await user.keyboard("{Delete}");
    expect(screen.getByLabelText("Litho From (m), row 1")).toHaveValue(null);
  });
});

const storedRows = async () =>
  ((await readRawLithoDraft("KEYBOARD")) as RawLithoDocument | null)?.rows;
const cell = (label: string) => screen.getByLabelText(label);
const cellOf = (label: string) => cell(label).closest("td");
const ctrlClick = (label: string) =>
  fireEvent.mouseDown(cell(label), { ctrlKey: true });
const paste = (label: string, text: string) =>
  fireEvent.paste(cell(label), { clipboardData: { getData: () => text } });
const pageRows = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    validRow(`r${index}`, index * 10, index * 10 + 10),
  );

describe("Tab navigation", () => {
  it("moves like the arrows, wraps rows, and appends only a valid row", async () => {
    const user = await table(pageRows(2));
    await user.click(cell("Litho From (m), row 1"));
    await user.tab();
    expect(cell("Litho To (m), row 1")).toHaveFocus();
    await user.tab({ shift: true });
    expect(cell("Litho From (m), row 1")).toHaveFocus();

    // Disabled lookups (no values loaded) are skipped; rows wrap both ways.
    await user.click(cell("Redox Code, row 1"));
    await user.tab();
    expect(cell("Lithology Comments, row 1")).toHaveFocus();
    await user.click(cell("Hardness, row 1"));
    await user.tab();
    expect(cell("Litho From (m), row 2")).toHaveFocus();
    await user.tab({ shift: true });
    expect(cell("Hardness, row 1")).toHaveFocus();

    await user.click(cell("Hardness, row 2"));
    await user.tab();
    await waitFor(() => expect(cell("Litho From (m), row 3")).toHaveFocus());

    // The new row is incomplete, so Tab from its end is refused.
    await user.click(cell("Hardness, row 3"));
    await user.tab();
    expect(screen.queryByLabelText("Litho From (m), row 4")).toBeNull();
    expect(cell("Litho To (m), row 3")).toHaveFocus();
    expect(toast).toHaveBeenCalledWith(
      TOAST_NOTIFICATIONS.missingRequiredFields,
    );
  });

  it("crosses table pages in both directions", async () => {
    const user = await table(pageRows(51));
    await user.click(cell("Hardness, row 50"));
    await user.tab();
    await waitFor(() => expect(cell("Litho From (m), row 51")).toHaveFocus());
    await user.tab({ shift: true });
    await waitFor(() => expect(cell("Hardness, row 50")).toHaveFocus());
  });
});

describe("comment cells", () => {
  it("keeps typed spaces through editing and autosave", async () => {
    const user = await table();
    const comment = cell("Lithology Comments, row 1");
    await user.click(comment);
    await user.keyboard(" Fine  grained sandstone ");
    expect(comment).toHaveValue(" Fine  grained sandstone ");
    await waitFor(async () =>
      expect(
        (await storedRows())?.[0]?.lithologyComments,
      ).toBe(" Fine  grained sandstone "),
    );
  });

  it("keeps comment spaces on import while still trimming codes", () => {
    const imported = normalizeRawLithoDocument({
      rows: [{ id: 1, lithoCode: " SST ", lithologyComments: "  a  b  " }],
    });
    expect(imported.rows[0]?.lithologyComments).toBe("  a  b  ");
    expect(imported.rows[0]?.lithoCode).toBe("SST");
  });
});

describe("cell selection and clipboard", () => {
  it("toggles with Ctrl + click and clears on a plain click elsewhere", async () => {
    await table(pageRows(2));
    ctrlClick("Litho From (m), row 1");
    ctrlClick("Litho Code, row 2");
    expect(cellOf("Litho From (m), row 1")).toHaveClass("raw-litho-cell--selected");
    expect(cellOf("Litho Code, row 2")).toHaveClass("raw-litho-cell--selected");
    expect(cell("Litho Code, row 2")).toHaveFocus();

    ctrlClick("Litho Code, row 2");
    expect(cellOf("Litho Code, row 2")).not.toHaveClass("raw-litho-cell--selected");

    fireEvent.mouseDown(cell("Litho From (m), row 1"));
    expect(cellOf("Litho From (m), row 1")).toHaveClass("raw-litho-cell--selected");
    fireEvent.mouseDown(cell("Litho To (m), row 2"));
    expect(document.querySelector(".raw-litho-cell--selected")).toBeNull();
  });

  it("copies a non-adjacent selection as a rectangle without unselected values", async () => {
    await table(pageRows(2));
    ctrlClick("Litho From (m), row 1");
    ctrlClick("Litho Code, row 2");
    const setData = vi.fn();
    fireEvent.copy(cell("Litho Code, row 2"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "0\t\t\n\t\tUnknown");
  });

  it("builds and parses Excel-style text", () => {
    const rows = [{ ...validRow("a", 1, 2), lithologyComments: "x\ty" }];
    expect(
      buildClipboardText(rows, [
        { rowId: "a", columnKey: "lithoTo" },
        { rowId: "a", columnKey: "lithologyComments" },
        { rowId: "a", columnKey: "lithoFrom" },
      ]),
    ).toBe(`1\t2${"\t".repeat(10)}x y`);
    expect(parseClipboardText("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("pastes a block from the anchor, re-sorts and keeps the selection on its row", async () => {
    await table(pageRows(2));
    ctrlClick("Litho From (m), row 1");
    expect(paste("Litho From (m), row 1", "50\t60\tunknown")).toBe(false);

    expect(cell("Litho From (m), row 1")).toHaveValue(10);
    expect(cell("Litho From (m), row 2")).toHaveValue(50);
    expect(cell("Litho To (m), row 2")).toHaveValue(60);
    expect(cell("Litho Code, row 2")).toHaveValue("Unknown");
    expect(cellOf("Litho From (m), row 2")).toHaveClass("raw-litho-cell--selected");

    await waitFor(async () =>
      expect(
        (await storedRows())?.map((row) => row.id),
      ).toEqual(["r1", "r0"]),
    );
  });

  it("pastes a multi-cell clipboard into the focused cell without a selection", async () => {
    const user = await table(pageRows(2));
    await user.click(cell("Lithology Comments, row 1"));
    paste("Lithology Comments, row 1", "fine  sand\nclay ");
    expect(cell("Lithology Comments, row 1")).toHaveValue("fine  sand");
    expect(cell("Lithology Comments, row 2")).toHaveValue("clay ");

    // A single value without a selection stays a native input paste.
    expect(paste("Lithology Comments, row 1", "text")).toBe(true);
  });

  it("fills one value into every selected editable cell", async () => {
    await table(pageRows(2));
    ctrlClick("Lithology Comments, row 1");
    ctrlClick("Lithology Comments, row 2");
    ctrlClick("CA, row 1");
    paste("Lithology Comments, row 2", "minor clay  alteration");
    expect(cell("Lithology Comments, row 1")).toHaveValue("minor clay  alteration");
    expect(cell("Lithology Comments, row 2")).toHaveValue("minor clay  alteration");
    expect(cell("CA, row 1")).toHaveValue("");
  });

  it.each([
    ["abc", "invalidPasteValue"],
    ["5\t1", "invalidDepthRange"],
    ["10\t20", "duplicateInterval"],
    ["0\t10\tNOPE", "invalidLookupValue"],
    ["\t10\t", "missingRequiredFields"],
    ["1\n2\n3", "pasteOutOfRange"],
  ] as const)("rejects %j as a whole with %s", async (text, issue) => {
    await table(pageRows(2));
    ctrlClick("Litho From (m), row 1");
    paste("Litho From (m), row 1", text);
    expect(toast).toHaveBeenCalledWith(TOAST_NOTIFICATIONS[issue]);
    expect(cell("Litho From (m), row 1")).toHaveValue(0);
    expect(cell("Litho To (m), row 1")).toHaveValue(10);
    expect(cell("Litho Code, row 1")).toHaveValue("Unknown");
  });

  it("rejects ambiguous shapes and read-only targets", async () => {
    await table(pageRows(2));
    ctrlClick("Litho From (m), row 1");
    ctrlClick("Litho Code, row 2");
    paste("Litho Code, row 2", "1\t2");
    expect(toast).toHaveBeenCalledWith(TOAST_NOTIFICATIONS.pasteShapeMismatch);

    fireEvent.mouseDown(cell("Litho To (m), row 2"));
    // CA, right of Color Code, has no values loaded and is disabled.
    ctrlClick("Colour, row 1");
    paste("Colour, row 1", "\tx");
    expect(toast).toHaveBeenCalledWith(TOAST_NOTIFICATIONS.pasteNotEditable);
    expect(cell("Colour, row 1")).toHaveValue("Unknown");
  });
});
