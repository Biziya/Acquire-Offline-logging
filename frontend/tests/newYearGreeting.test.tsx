import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewYearGreeting from "../src/components/NewYearGreeting/NewYearGreeting";
import { greetingYear, isInWindow } from "../src/components/NewYearGreeting/greetingDates";
import { greetingConfig } from "../src/components/NewYearGreeting/config";

const NOV_12_2026 = new Date(2026, 10, 12, 9, 0);

describe("isInWindow", () => {
  const start = { month: 11, day: 12 };
  const end = { month: 12, day: 31 };

  it("includes both end days", () => {
    expect(isInWindow(new Date(2026, 10, 11), start, end)).toBe(false);
    expect(isInWindow(new Date(2026, 10, 12), start, end)).toBe(true);
    expect(isInWindow(new Date(2026, 11, 31), start, end)).toBe(true);
    expect(isInWindow(new Date(2027, 0, 1), start, end)).toBe(false);
  });

  it("handles a window that crosses the year end", () => {
    const from = { month: 12, day: 25 };
    const to = { month: 1, day: 15 };
    expect(isInWindow(new Date(2026, 11, 28), from, to)).toBe(true);
    expect(isInWindow(new Date(2027, 0, 10), from, to)).toBe(true);
    expect(isInWindow(new Date(2027, 0, 16), from, to)).toBe(false);
    expect(isInWindow(new Date(2026, 11, 24), from, to)).toBe(false);
  });
});

describe("greetingYear", () => {
  it("welcomes next year from October on", () => {
    expect(greetingYear(NOV_12_2026)).toBe(2027);
    expect(greetingYear(new Date(2027, 0, 5))).toBe(2027);
  });
});

describe("NewYearGreeting", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  it("shows both languages and the Data team signature", () => {
    vi.setSystemTime(NOV_12_2026);
    render(<NewYearGreeting />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(greetingConfig.title.mn)).toBeInTheDocument();
    expect(screen.getByText("Happy New Year 2027!")).toBeInTheDocument();
    expect(screen.getByText(/Он цагийн тооллоор/)).toBeInTheDocument();
    expect(screen.getByText(/success at work/)).toBeInTheDocument();
    expect(screen.getByText("Data team")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: greetingConfig.button })).toHaveFocus();
  });

  it("closes on the button and stays closed", () => {
    vi.setSystemTime(NOV_12_2026);
    const { unmount } = render(<NewYearGreeting />);

    fireEvent.click(screen.getByRole("button", { name: greetingConfig.button }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("newYearGreetingSeen-2027")).not.toBeNull();

    unmount();
    render(<NewYearGreeting />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape without reaching other key handlers", () => {
    vi.setSystemTime(NOV_12_2026);
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    render(<NewYearGreeting />);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
  });

  it("does not show outside the dates", () => {
    vi.setSystemTime(new Date(2026, 10, 11));
    render(<NewYearGreeting />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
