import { render, screen } from "@testing-library/react";
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

  const rows = (container: HTMLElement) =>
    container.querySelectorAll("tbody tr[aria-rowindex]");

  it("offers only the Drillhole selector and shows its Project and Campaign read-only", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    expect(screen.getByText(/Mock data/)).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();
    expect(screen.getByText("No drillhole selected")).toBeInTheDocument();
    expect(screen.getByText("Select a drillhole to view its records.")).toBeInTheDocument();
    expect(rows(container)).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText("Drillhole"), "MOCK-DH-012-003");
    expect(screen.getByLabelText("Project")).toHaveTextContent("MOCK-PRJ-01");
    expect(screen.getByLabelText("Campaign")).toHaveTextContent("MOCK-C2026");
    expect(screen.getByLabelText("Project").tagName).toBe("OUTPUT");
    expect(screen.getByText("139 records")).toBeInTheDocument();

    // Read-only: plain text cells, no inputs or row actions.
    const table = screen.getByRole("region", { name: "Lithology records" });
    expect(table.querySelector("input, select, textarea, button")).toBeNull();
    expect(screen.queryByRole("button", { name: /add row|remove|save/i })).toBeNull();

    // Ordered by Litho From, numbered from 1 like Raw Litho's "Ins".
    const depths = Array.from(rows(container)).map((row) =>
      Number(row.children[1]?.textContent),
    );
    expect(depths[0]).toBe(0);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(rows(container)[0]?.children[0]).toHaveTextContent("1");

    // No Refresh: the page has no buttons at all.
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses Raw Litho's columns and renders only a window of a large drillhole", async () => {
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    expect(
      Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent),
    ).toEqual([
      "Ins", "Litho From (m)", "Litho To (m)", "Litho Code", "Color Code", "CA", "OM",
      "OM Facies", "PY", "OX", "Sedim", "Redox Code", "Lithology Comments", "Granulo",
      "Hardness",
    ]);

    await user.selectOptions(screen.getByLabelText("Mock records"), "100000");
    await user.selectOptions(screen.getByLabelText("Drillhole"), "MOCK-DH-011-001");
    expect(screen.getByText("1,389 records")).toBeInTheDocument();
    expect(rows(container).length).toBeGreaterThan(0);
    expect(rows(container).length).toBeLessThan(100);

    await user.selectOptions(screen.getByLabelText("Drillhole"), "");
    expect(rows(container)).toHaveLength(0);
  });
});
