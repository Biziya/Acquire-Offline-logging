import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DatabaseViewer from "../src/pages/DatabaseViewer/DatabaseViewer";
import { databaseViewerConfig } from "../src/pages/DatabaseViewer/config";
import { generateMockLithologyRecords } from "../src/pages/DatabaseViewer/databaseViewerMockData";
import { stubDesktopViewport } from "./viewport";

const settings = databaseViewerConfig.mockData;

stubDesktopViewport();

describe("mock lithology data", () => {
  it("is reproducible, labelled as mock and has stable ids", () => {
    const first = generateMockLithologyRecords(10000, 1, settings);
    expect(first).toHaveLength(10000);
    expect(generateMockLithologyRecords(10000, 1, settings)).toEqual(first);
    expect(first.map((record) => record.id)).toEqual(
      Array.from({ length: 10000 }, (_, index) => index + 1),
    );
    expect(first.every((record) => record.drillhole.startsWith("MOCK-"))).toBe(true);
    expect(first.every((record) => record.lithoFrom < record.lithoTo)).toBe(true);

    // Intervals are contiguous within a drillhole.
    first.slice(1).forEach((record, index) => {
      const previous = first[index];
      if (previous && previous.drillhole === record.drillhole) {
        expect(record.lithoFrom).toBe(previous.lithoTo);
      }
    });
  });

  it("generates 100,000 records quickly", () => {
    const started = performance.now();
    expect(generateMockLithologyRecords(100000, 3, settings)).toHaveLength(100000);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("Database Viewer page", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders only a window of rows, filters, and refreshes without requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    expect(screen.getByText(/Mock data/)).toBeInTheDocument();
    expect(screen.getByText("Showing 10,000 of 10,000 records")).toBeInTheDocument();
    const renderedRows = container.querySelectorAll("tbody tr[aria-rowindex]");
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(100);
    expect(container.querySelector("input, textarea")?.getAttribute("type")).toBe("search");

    await user.selectOptions(screen.getByLabelText("Project"), "MOCK-PRJ-01");
    const filtered = screen.getByText(/^Showing [\d,]+ of 10,000 records$/);
    expect(filtered.textContent).not.toBe("Showing 10,000 of 10,000 records");

    await user.type(screen.getByLabelText("Search"), "no such value");
    await waitFor(() =>
      expect(screen.getByText("Showing 0 of 10,000 records")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Showing 10,000 of 10,000 records")).toBeInTheDocument();

    const before = container.querySelector("tbody tr[aria-rowindex]")?.textContent;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(container.querySelector("tbody tr[aria-rowindex]")?.textContent).not.toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
