import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RawLithoDocument } from "../src/types/domain";
import LookupAutocomplete from "../src/pages/RawLitho/LookupAutocomplete";
import RawLithoTable from "../src/pages/RawLitho/RawLithoTable";
import ConfirmDialog from "../src/components/ConfirmDialog";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import { useRemoveRowConfirmation } from "../src/pages/RawLitho/hooks/useRemoveRowConfirmation";
import {
  TOAST_NOTIFICATIONS,
} from "../src/pages/RawLitho/constants";
import { createSchemaRow } from "../src/types/rawLithoSchema";
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
    ["{Tab}", "After"], ["{Shift>}{Tab}{/Shift}", "Before"],
    ["{ArrowRight}", "After"], ["{ArrowLeft}", "Before"],
  ])("preserves empty values on %s", async (keys, label) => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Empty");
    await user.keyboard(keys);
    expect(input).toHaveValue("");
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label)).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it.each([
    ["{Tab}", "After"], ["{Shift>}{Tab}{/Shift}", "Before"],
    ["{End}{ArrowRight}", "After"], ["{Home}{ArrowLeft}", "Before"],
  ])("does not confirm a typed match on navigation %s", async (keys, label) => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Unk");
    expect(screen.getByRole("option", { name: "Unknown" })).toHaveClass("raw-litho-lookup-suggestion--active");
    await user.keyboard(keys);
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label)).toHaveFocus();
  });

  it("confirms the closest match with Enter and allows selecting empty with the mouse", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Unk{Enter}");
    expect(input).toHaveValue("Unknown");
    expect(change).toHaveBeenLastCalledWith("Unknown");
    await user.click(screen.getByLabelText("Before"));
    await user.click(input);
    await user.click(screen.getByRole("option", { name: "Empty" }));
    expect(input).toHaveValue("");
    expect(change).toHaveBeenLastCalledWith("");
  });

  it("reopens the same focused cell after choosing Empty and resets its filter", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Unk{Enter}");
    // Reopen without leaving the input, then filter and explicitly clear it.
    await user.click(input);
    await user.keyboard("{Control>}a{/Control}Oth");
    const empty = screen.getByRole("option", { name: "Empty" });
    expect(empty).toHaveClass("text-rl-text-muted");
    await user.click(empty);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    expect(change).toHaveBeenLastCalledWith("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    change.mockClear();
    await user.click(input);
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Empty", "Unknown", "Other"]);
    expect(input).toHaveFocus();
    expect(change).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("");
    expect(change).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("only browses options after F2 and only commits on Enter", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{F2}{ArrowDown}{ArrowDown}");
    expect(input).toHaveFocus();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Other" })).toHaveClass("raw-litho-lookup-suggestion--active");
    await user.tab();
    expect(change).not.toHaveBeenCalled();
    await user.click(input);
    await user.keyboard("{F2}{ArrowDown}{Enter}");
    expect(change).toHaveBeenLastCalledWith("Unknown");
    await user.keyboard("{F2}{ArrowUp}{Enter}");
    expect(change).toHaveBeenLastCalledWith("");
  });

  it("retains an existing value when a different draft is left unconfirmed", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Unknown{Enter}");
    change.mockClear();
    await user.keyboard("{Control>}a{/Control}Other");
    await user.tab();
    expect(input).toHaveValue("Unknown");
    expect(change).not.toHaveBeenCalled();
  });

  it("does not commit unmatched text and preserves validation", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<AutocompleteHarness onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "ZZZ{Enter}");
    await user.tab();
    expect(change).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
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
    ...createSchemaRow(id),
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
  it("moves backward one cell and stops repeatedly at the first cell without refocusing", async () => {
    const user = await table(pageRows(2));
    await user.click(cell("Colour, row 1"));
    for (const label of ["Litho Code, row 1", "Litho To (m), row 1", "Litho From (m), row 1"]) {
      await user.tab({ shift: true });
      expect(cell(label)).toHaveFocus();
    }
    const first = cell("Litho From (m), row 1");
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        expect(fireEvent.keyDown(first, { key: "Tab", shiftKey: true })).toBe(false);
        expect(first).toHaveFocus();
      }
      expect(focus).not.toHaveBeenCalled();
    } finally {
      focus.mockRestore();
    }
    await user.tab();
    expect(cell("Litho To (m), row 1")).toHaveFocus();
    await waitFor(async () => expect(await storedRows()).toEqual(pageRows(2)));
  });

  it("stops at the first editable cell even when earlier cells are hidden or read-only", async () => {
    const user = await table(pageRows(2));
    cell("Litho From (m), row 1").closest("td")!.hidden = true;
    (cell("Litho To (m), row 1") as HTMLInputElement).readOnly = true;
    await user.click(cell("Colour, row 1"));
    await user.tab({ shift: true });
    const first = cell("Litho Code, row 1");
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-expanded", "true");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.tab({ shift: true });
      expect(first).toHaveFocus();
    }
    expect(first).toHaveValue("Unknown");
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
  });
  it("does not refocus or fall back when a logical focus request is already satisfied", async () => {
    const user = await table(pageRows(2));
    const input = cell("Litho Code, row 1");
    await user.click(input);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      expect(focusCellInRow(input.closest("tbody"), "r0", "lithoCode")).toBe(true);
      expect(input).toHaveFocus();
      expect(focus).not.toHaveBeenCalled();
    } finally {
      focus.mockRestore();
    }
  });
  it("moves exactly one cell from secondary controls without their own keyboard handlers", async () => {
    const user = await table(pageRows(2));
    const secondary = document.createElement("input");
    secondary.setAttribute("aria-label", "Secondary colour control");
    cell("Colour, row 1").closest("td")!.append(secondary);
    await user.click(secondary);
    await user.tab({ shift: true });
    expect(cell("Litho Code, row 1")).toHaveFocus();
    await user.click(secondary);
    await user.tab();
    expect(cell("Redox Code, row 1")).toHaveFocus();
    expect(cell("Colour, row 1")).toHaveValue("Unknown");
    expect(screen.queryByLabelText("Litho From (m), row 3")).toBeNull();
  });
  it("adds one row through Tab across a page boundary, scrolls to it, and persists existing values", async () => {
    const existing = pageRows(50);
    const user = await table(existing);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      await user.click(cell("Hardness, row 50"));
      await user.tab();
      await waitFor(() => expect(cell("Litho From (m), row 51")).toHaveFocus());
      expect(screen.queryByLabelText("Litho From (m), row 52")).toBeNull();
      expect(scroll.mock.contexts.filter(target => target === cell("Litho From (m), row 51"))).toHaveLength(1);
      expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(toast.mock.calls.filter(([notification]) => notification === TOAST_NOTIFICATIONS.rowAdded)).toHaveLength(1);
      await waitFor(async () => {
        const saved = await storedRows();
        expect(saved).toHaveLength(51);
        expect(saved?.slice(0, 50)).toEqual(existing);
        expect(saved?.[50]).toMatchObject({ lithoFrom: "500", lithoTo: "", lithoCode: "Unknown", colorCode: "Unknown", redoxCode: "Unknown", hardness: "" });
      });
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("creates a row from the final editable cell when later columns are hidden or read-only", async () => {
    const user = await table();
    cell("Hardness, row 1").closest("td")!.hidden = true;
    (cell("Granulo, row 1") as HTMLInputElement).disabled = true;
    (cell("Lithology Comments, row 1") as HTMLInputElement).readOnly = true;
    await user.click(cell("Redox Code, row 1"));
    await user.tab();
    await waitFor(() => expect(cell("Litho From (m), row 2")).toHaveFocus());
    expect(screen.queryByLabelText("Litho From (m), row 3")).toBeNull();
  });

  it("keeps the backward destination on its logical row after a depth edit reorders rows", async () => {
    const user = await table(pageRows(2));
    const from = cell("Litho From (m), row 2");
    await user.click(from);
    fireEvent.change(from, { target: { value: "-5" } });
    await user.tab({ shift: true });
    await waitFor(() => {
      expect(cell("Litho From (m), row 1")).toHaveValue(-5);
      expect(cell("Hardness, row 2")).toHaveFocus();
      expect(document.activeElement?.closest("tr")).toHaveAttribute("data-row-id", "r0");
    });
    await user.tab({ shift: true });
    expect(cell("Granulo, row 2")).toHaveFocus();
  });
  it("stops backward navigation at the document start and preserves forward row creation", async () => {
    const user = await table(pageRows(51));
    await user.click(cell("Litho From (m), row 1"));
    await user.tab({ shift: true });
    expect(cell("Litho From (m), row 1")).toHaveFocus();
    await user.click(cell("Hardness, row 50"));
    await user.tab();
    await waitFor(() => expect(cell("Litho From (m), row 51")).toHaveFocus());
    await user.click(cell("Hardness, row 51"));
    expect(cell("Hardness, row 51")).toHaveAttribute("aria-expanded", "true");
    expect(cell("Hardness, row 51")).toHaveValue("");
    await user.tab();
    await waitFor(() => expect(cell("Litho From (m), row 52")).toHaveFocus());
    expect(screen.queryByLabelText("Litho From (m), row 53")).toBeNull();
    await waitFor(async () => expect(await storedRows()).toHaveLength(52));
  });

  it("skips read-only, disabled, and hidden cells when moving backward across rows", async () => {
    const user = await table(pageRows(2));
    (cell("Lithology Comments, row 1") as HTMLInputElement).readOnly = true;
    cell("Granulo, row 1").closest("td")!.style.display = "none";
    (cell("Hardness, row 1") as HTMLInputElement).disabled = true;
    await user.click(cell("Redox Code, row 1"));
    await user.tab();
    expect(cell("Litho From (m), row 2")).toHaveFocus();
    await user.tab({ shift: true });
    expect(cell("Redox Code, row 1")).toHaveFocus();

    cell("Hardness, row 2").closest("td")!.hidden = true;
    (cell("Granulo, row 2") as HTMLInputElement).disabled = true;
    await user.click(cell("Litho From (m), row 1"));
    await user.tab({ shift: true });
    expect(cell("Litho From (m), row 1")).toHaveFocus();
    await user.click(cell("Litho From (m), row 2"));
    await user.tab({ shift: true });
    expect(cell("Redox Code, row 1")).toHaveFocus();
    await user.click(cell("Lithology Comments, row 2"));
    await user.tab({ shift: true });
    expect(cell("Redox Code, row 2")).toHaveFocus();
    await user.click(cell("Litho From (m), row 1"));
    cell("Litho From (m), row 2").closest("tr")!.hidden = true;
    await user.tab({ shift: true });
    expect(cell("Litho From (m), row 1")).toHaveFocus();
  });

  it("allows browser focus navigation after Escape and resumes editing on re-entry", async () => {
    const user = await table(pageRows(2));
    await user.click(cell("Litho From (m), row 1"));
    await user.keyboard("{Escape}");
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Select" })).toHaveFocus();
    await user.tab();
    expect(cell("Litho From (m), row 1")).toHaveFocus();
    await user.tab({ shift: true });
    expect(cell("Litho From (m), row 1")).toHaveFocus();
    await user.click(cell("Hardness, row 2"));
    await user.keyboard("{Escape}");
    await user.tab();
    expect(screen.getByRole("button", { name: /Add row/ })).toHaveFocus();
  });
  it("moves through consecutive filled cells and rows with one arrow per move", async () => {
    const user = await table(pageRows(2));
    await user.click(cell("Litho To (m), row 1"));
    await user.tab();
    expect(cell("Litho Code, row 1")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(cell("Colour, row 1")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(cell("Colour, row 2")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(cell("Litho Code, row 2")).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(cell("Litho Code, row 1")).toHaveFocus();
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    await waitFor(async () => expect(await storedRows()).toEqual(pageRows(2)));
  });

  it("keeps optional local dropdowns empty through Tab and arrow navigation", async () => {
    const user = await table(pageRows(2));
    await user.click(cell("Lithology Comments, row 1"));
    await user.tab();
    expect(cell("Granulo, row 1")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(cell("Hardness, row 1")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(cell("Hardness, row 2")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(cell("Granulo, row 2")).toHaveFocus();
    await user.tab({ shift: true });
    expect(cell("Lithology Comments, row 2")).toHaveFocus();
    await waitFor(async () => expect(await storedRows()).toEqual(pageRows(2)));
  });

  it("keeps normal caret editing and partial text selections inside a text cell", async () => {
    const user = await table([{ ...validRow("r0", 0, 10), lithologyComments: "Fine sand" }]);
    const input = cell("Lithology Comments, row 1") as HTMLInputElement;
    await user.click(input);
    input.setSelectionRange(2, 2);
    expect(fireEvent.keyDown(input, { key: "ArrowRight" })).toBe(true);
    expect(input).toHaveFocus();
    input.setSelectionRange(1, 4);
    expect(fireEvent.keyDown(input, { key: "ArrowLeft" })).toBe(true);
    expect(input).toHaveFocus();
    input.select();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(cell("Granulo, row 1")).toHaveFocus();
  });

  it("does not create a row while browsing options, and validates an explicitly cleared required value", async () => {
    const user = await table();
    await user.click(cell("Litho Code, row 1"));
    await user.keyboard("{F2}{ArrowDown}");
    expect(cell("Litho Code, row 1")).toHaveFocus();
    expect(screen.queryByLabelText("Litho From (m), row 2")).toBeNull();
    await user.click(screen.getByRole("option", { name: "Empty" }));
    expect(cell("Litho Code, row 1")).toHaveValue("");
    await user.keyboard("{F4}");
    expect(screen.queryByLabelText("Litho From (m), row 2")).toBeNull();
    expect(toast).toHaveBeenCalledWith(TOAST_NOTIFICATIONS.missingRequiredFields);
  });
  it("moves across rows and creates a validated row at the final editable cell", async () => {
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
    expect(screen.queryByLabelText("Litho From (m), row 4")).toBeNull();
    await user.click(cell("Hardness, row 3"));
    await user.tab();
    expect(cell("Litho To (m), row 3")).toHaveFocus();
    expect(screen.queryByLabelText("Litho From (m), row 4")).toBeNull();
    expect(toast).toHaveBeenCalledWith(TOAST_NOTIFICATIONS.missingRequiredFields);
  });

  it("Enter confirms partial lookup matches before table navigation", async () => {
    const user = await table([
      { ...validRow("r0", 0, 10), lithoCode: "", colorCode: "" },
    ]);
    await user.click(cell("Litho Code, row 1"));
    await user.keyboard("Unk{Enter}");
    await user.tab();
    expect(cell("Litho Code, row 1")).toHaveValue("Unknown");
    expect(cell("Colour, row 1")).toHaveFocus();

    await user.keyboard("unk{Enter}");
    await user.tab({ shift: true });
    expect(cell("Colour, row 1")).toHaveValue("Unknown");
    expect(cell("Litho Code, row 1")).toHaveFocus();
    expect(screen.queryByLabelText("Litho From (m), row 2")).toBeNull();
    await waitFor(async () =>
      expect((await storedRows())?.[0]).toMatchObject({
        lithoCode: "Unknown",
        colorCode: "Unknown",
      }),
    );
  });

  it("Tab preserves the confirmed last lookup value when adding a new row", async () => {
    const user = await table();
    await user.click(cell("Hardness, row 1"));
    await user.keyboard("7{Enter}");
    await user.tab();
    await waitFor(() => expect(cell("Litho From (m), row 2")).toHaveFocus());
    expect(screen.queryByLabelText("Litho From (m), row 3")).toBeNull();
    expect(cell("Hardness, row 1")).toHaveValue("7");
    await waitFor(async () => expect((await storedRows())?.[0]?.hardness).toBe("7"));

    // Shift + Tab from the first cell of the first row never creates a row.
    await user.click(cell("Litho From (m), row 1"));
    await user.tab({ shift: true });
    expect(screen.queryByLabelText("Litho From (m), row 3")).toBeNull();
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
  it("rejects initial spaces and normalizes pasted leading or whitespace-only text", async () => {
    const user = await table();
    const input = cell("Lithology Comments, row 1");
    await user.click(input);
    await user.keyboard("   ");
    expect(input).toHaveValue("");
    await user.paste("   Clay  with sand ");
    expect(input).toHaveValue("Clay  with sand ");
    await user.clear(input);
    await user.paste("   ");
    expect(input).toHaveValue("");
    await waitFor(async () => expect((await storedRows())?.[0]?.lithologyComments).toBe(""));
  });
  it("removes leading whitespace and keeps internal spaces through autosave", async () => {
    const user = await table();
    const comment = cell("Lithology Comments, row 1");
    await user.click(comment);
    await user.keyboard(" Fine  grained sandstone ");
    expect(comment).toHaveValue("Fine  grained sandstone ");
    await waitFor(async () =>
      expect(
        (await storedRows())?.[0]?.lithologyComments,
      ).toBe("Fine  grained sandstone "),
    );
  });

  it("normalizes leading comment whitespace on import while still trimming codes", () => {
    const imported = normalizeRawLithoDocument({
      rows: [{ id: 1, lithoCode: " SST ", lithologyComments: "  a  b  " }],
    });
    expect(imported.rows[0]?.lithologyComments).toBe("a  b  ");
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
