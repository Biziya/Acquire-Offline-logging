import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LookupAutocomplete from "../src/pages/RawLitho/LookupAutocomplete";

function grid(value = "Last") {
  const change = vi.fn();
  render(<table><tbody>{[0, 1, 2].map(row => <tr key={row}>
    {[0, 1, 2].map(col => <td key={col}><LookupAutocomplete
      rowIndex={row}
      lookup={{ fieldKey: "lithoCode", codeProperty: "code", label: `Column ${col}` }}
      records={["A", "B", "C", "D", "E", "F", "Last"].map(code => ({ code }))}
      value={value} onValueChange={change} isPageEnabled isLoading={false} error=""
    /></td>)}
  </tr>)}</tbody></table>);
  return change;
}

describe("lookup keyboard entry", () => {
  it.each([
    ["Tab", false, 5], ["Tab", true, 3],
    ["ArrowUp", false, 1], ["ArrowDown", false, 7],
    ["ArrowLeft", false, 3], ["ArrowRight", false, 5],
  ])("opens all options after %s (shift: %s)", async (key, shiftKey, target) => {
    const user = userEvent.setup();
    const change = grid();
    const inputs = screen.getAllByRole("combobox") as HTMLInputElement[];
    const source = inputs[4]!;
    const destination = inputs[target]!;
    await user.click(source);
    source.select();
    fireEvent.keyDown(source, { key, shiftKey });
    expect(inputs[target]).toHaveFocus();
    expect(inputs[target]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(screen.getByRole("listbox").id).toBe(destination.getAttribute("aria-controls"));
    expect(screen.getAllByRole("option")).toHaveLength(8);
    expect(change).not.toHaveBeenCalled();
    expect(inputs[4]).toHaveValue("Last");
    await user.keyboard("F");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "F" })).toBeInTheDocument();
  });

  it("leaves Alt + Tab unhandled and keeps the focused cell and dropdown", async () => {
    const user = userEvent.setup();
    grid();
    const input = screen.getAllByRole("combobox")[4]!;
    await user.click(input);
    expect(fireEvent.keyDown(input, { key: "Tab", altKey: true })).toBe(true);
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
  });
});
