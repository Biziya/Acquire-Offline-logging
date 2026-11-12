import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import KeyboardShortcuts from "../src/components/KeyboardShortcuts";

describe("keyboard shortcuts popup", () => {
  it("opens from the keyboard, focuses Close, and restores trigger focus on Escape", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);
    const trigger = screen.getByRole("button", { name: "Help and shortcuts" });
    expect(trigger).toHaveAttribute("title", "Help and shortcuts");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close shortcuts" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes with the close button, a second trigger click, or an outside click", async () => {
    const user = userEvent.setup();
    render(<><KeyboardShortcuts /><button>Outside</button></>);
    const trigger = screen.getByRole("button", { name: "Help and shortcuts" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close shortcuts" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByText("Move around"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("lists the implemented shortcuts in groups with explicit separators", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);
    await user.click(screen.getByRole("button", { name: "Help and shortcuts" }));
    const popup = screen.getByRole("dialog");
    expect(within(popup).getAllByRole("heading", { level: 3 }).map(h => h.textContent))
      .toEqual(["Move around", "Edit and select", "RowsRaw Litho only", "Drillhole searchRaw Litho only"]);
    const shiftTab = popup.querySelector('[aria-label="Shift + Tab"]')!;
    expect(shiftTab).toHaveTextContent("Shift+Tab");
    expect(within(shiftTab as HTMLElement).getByText("+")).toBeInTheDocument();
    for (const label of ["Ctrl + Click", "Ctrl + C", "Ctrl + V", "↑ / ↓", "← / →",
      "PgUp / PgDn", "Esc then Tab", "F2", "Delete", "F4", "F5", "Tab / ↓"]) {
      expect(popup.querySelector(`[aria-label="${label}"]`), label).toBeInTheDocument();
    }
    expect(within(popup).getAllByRole("definition")).toHaveLength(21);
    // One line per shortcut: keys never wrap, long descriptions are cut off.
    for (const term of within(popup).getAllByRole("term")) expect(term).toHaveClass("whitespace-nowrap");
    for (const definition of within(popup).getAllByRole("definition")) {
      expect(definition.firstElementChild).toHaveClass("truncate");
    }
    // Every row is unique: no duplicate key + description pairs.
    const rows = [...popup.querySelectorAll("dl > div")].map(row => row.textContent);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it("keeps popup key presses away from window table shortcuts and removes listeners when closed", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);
    await user.click(screen.getByRole("button", { name: "Help and shortcuts" }));
    const listener = vi.fn();
    window.addEventListener("keydown", listener);
    try {
      const close = screen.getByRole("button", { name: "Close shortcuts" });
      for (const key of ["F4", "F5", "PageDown", "ArrowDown"]) fireEvent.keyDown(close, { key });
      expect(listener).not.toHaveBeenCalled();
      await user.keyboard("{Escape}");
      expect(listener).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: "F4" });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });
});
