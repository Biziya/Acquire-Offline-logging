import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import KeyboardShortcuts from "../src/components/KeyboardShortcuts";

describe("keyboard shortcuts popup", () => {
  it("opens from the keyboard, focuses Close, and restores trigger focus on Escape", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);
    const trigger = screen.getByRole("button", { name: "Keyboard shortcuts" });
    expect(trigger).toHaveAttribute("title", "Keyboard shortcuts");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close keyboard shortcuts" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes with the close button, a second trigger click, or an outside click", async () => {
    const user = userEvent.setup();
    render(<><KeyboardShortcuts /><button>Outside</button></>);
    const trigger = screen.getByRole("button", { name: "Keyboard shortcuts" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close keyboard shortcuts" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByText("Table navigation · Raw Litho / Upload Data"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("keeps popup key presses away from window table shortcuts and removes listeners when closed", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);
    await user.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    const listener = vi.fn();
    window.addEventListener("keydown", listener);
    try {
      const close = screen.getByRole("button", { name: "Close keyboard shortcuts" });
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
