import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LookupAutocomplete from "../src/pages/RawLitho/LookupAutocomplete";
import RawLithoTable from "../src/pages/RawLitho/RawLithoTable";
import ConfirmDialog from "../src/pages/RawLitho/ConfirmDialog";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import { useRemoveRowConfirmation } from "../src/pages/RawLitho/hooks/useRemoveRowConfirmation";
import { createEmptyRow } from "../src/pages/RawLitho/constants";
import { createRawLithoDocument } from "../src/pages/RawLitho/rawLithoHelpers";
import { writeRawLithoDraft } from "../src/services/IndexDB/rawLithoDraftDb";
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

function TableHarness() {
  const workspace = useRawLithoWorkspace({
    drillholes: [{ holeId: "KEYBOARD", campaign: "C", projectCode: "P" }],
    showToast: () => {},
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
async function table() {
  const first = {
    ...createEmptyRow("initial"),
    lithoFrom: "10",
    lithoTo: "20",
    lithoCode: "Unknown",
    colorCode: "Unknown",
    redoxCode: "Unknown",
  };
  await writeRawLithoDraft(
    "KEYBOARD",
    createRawLithoDocument({ drillhole: "KEYBOARD", rows: [first] }),
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
