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
      lookupOptions={{ lithoCode: ["SS", "SH", "CL"] }}
      isReadOnly={isReadOnly}
      onEdit={onEdit}
    />,
  );
  return onEdit;
}

// The browser's <datalist> popup is replaced by the Raw Litho lookup menu.
describe("Upload Data lookup menu", () => {
  it("opens the white Raw Litho menu on click and selects a code", async () => {
    const user = userEvent.setup();
    const onEdit = renderTable();
    expect(document.querySelector("datalist")).toBeNull();

    const cell = screen.getByRole("combobox", { name: "Litho Code, record 1" });
    await user.click(cell);

    const menu = screen.getByRole("listbox");
    expect(menu).toHaveClass("bg-white", "rounded-ui", "border-rl-border");
    expect(screen.getByRole("option", { name: "SS" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "SS" })).toHaveClass("bg-rl-navy-soft");

    fireEvent.mouseDown(screen.getByRole("option", { name: "CL" }));
    expect(onEdit).toHaveBeenCalledWith([{ rowIndex: 0, field: "lithoCode", text: "CL" }]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(cell).toHaveFocus();
  });

  it("closes on Escape and when focus leaves the cell", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Litho Code, record 2" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Litho Code, record 2" }));
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("never opens while the table is read-only", async () => {
    const user = userEvent.setup();
    renderTable(vi.fn(), true);

    await user.click(screen.getByRole("combobox", { name: "Litho Code, record 1" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
