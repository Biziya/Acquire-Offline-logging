import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import UploadDataTable from "../src/pages/UploadData/UploadDataTable";
import { stubDesktopViewport } from "./viewport";

stubDesktopViewport();

const rows = [
  { id: 1, lithoFrom: 0, lithoTo: 10, lithoCode: "SS", lithologyComments: "" },
  { id: 2, lithoFrom: 10, lithoTo: 20, lithoCode: "", lithologyComments: "" },
];

function renderTable(onEdit = vi.fn(), isReadOnly = false) {
  render(
    <UploadDataTable
      rows={rows}
      visibleRows={[0, 1]}
      validation={null}
      lookups={{
        records: { lithoCode: [{ lithoCode: "SS" }, { lithoCode: "SH" }, { lithoCode: "CL" }] },
        state: { lithoCode: "ready" },
      }}
      isReadOnly={isReadOnly}
      onEdit={onEdit}
    />,
  );
  return onEdit;
}

// Lookup cells are the same cell Raw Litho uses.
describe("Upload Data lookup cells", () => {
  it("shows the dropdown arrow and opens the list on focus", async () => {
    const user = userEvent.setup();
    const onEdit = renderTable();

    const cell = screen.getByRole("combobox", { name: /Litho Code, row 1/ });
    expect(cell.parentElement?.querySelector("[data-open]")).not.toBeNull();

    await user.click(cell);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Empty" })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("option", { name: "CL" }));
    expect(onEdit).toHaveBeenCalledWith([{ rowIndex: 0, field: "lithoCode", text: "CL" }]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(cell).toHaveFocus();
  });

  it("keeps typed text as a draft until Enter picks a match", async () => {
    const user = userEvent.setup();
    const onEdit = renderTable();

    await user.click(screen.getByRole("combobox", { name: /Litho Code, row 2/ }));
    await user.keyboard("C");
    expect(onEdit).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledWith([{ rowIndex: 1, field: "lithoCode", text: "CL" }]);
  });

  it("closes on Escape and when focus leaves the cell", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("combobox", { name: /Litho Code, row 2/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.click(screen.getByRole("combobox", { name: /Litho Code, row 2/ }));
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("is disabled while the table is read-only", () => {
    renderTable(vi.fn(), true);

    expect(screen.getByRole("combobox", { name: /Litho Code, row 1/ })).toBeDisabled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
