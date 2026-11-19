import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RawExtraction from "../src/pages/RawExtraction/RawExtraction";
import { stubDesktopViewport } from "./viewport";

// Raw Litho's drillhole list, as on Raw Litho.
vi.mock("../src/services/Api/drillholeApi", () => ({
  getDrillholes: vi.fn(async () => [
    { holeId: "ZOOV_1410_1", projectCode: "ZOOVCH", campaign: "2026" },
    { holeId: "ZOOV_1411_1", projectCode: "ZOOVCH", campaign: "2026" },
  ]),
}));

stubDesktopViewport();

const bodyRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("tbody tr[data-row-id]"));

async function chooseDrillhole(user: ReturnType<typeof userEvent.setup>, holeId: string) {
  const input = screen.getByRole("combobox", { name: "Drillhole" });
  await waitFor(() => expect(input).toBeEnabled());
  await user.clear(input);
  await user.type(input, holeId);
  await user.click(screen.getByRole("option", { name: holeId }));
}

describe("Raw Extraction page", () => {
  it("asks for a drillhole before showing any rows", () => {
    const { container } = render(<RawExtraction />);

    expect(screen.getByRole("heading", { name: "Raw Extraction" })).toBeInTheDocument();
    expect(screen.getByText("Select a drillhole to view its core runs.")).toBeInTheDocument();
    expect(bodyRows(container)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /save|delete recovery|core phase/i })).toBeNull();
  });

  it("shows the sample core runs with dropdowns in the first two columns", async () => {
    const user = userEvent.setup();
    const { container } = render(<RawExtraction />);

    await chooseDrillhole(user, "ZOOV_1410_1");

    const headers = Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(headers).toEqual([
      "No.",
      "Extraction Type",
      "Coring Method",
      "Core Pass #",
      "Start Depth (m)",
      "End Depth (m)",
      "Recovered (m)",
      "Recovery (%)",
      "Mud Layer (%)",
      "Mud Imp (%)",
    ]);
    expect(bodyRows(container)).toHaveLength(20);

    const firstRow = bodyRows(container)[0];
    if (!firstRow) throw new Error("no rows");
    const cells = Array.from(firstRow.querySelectorAll("td[data-column]"));
    expect(cells.map((cell) => cell.querySelector("[role=combobox]") !== null)).toEqual([
      true, true, false, false, false, false, false, false, false,
    ]);
    expect(within(firstRow as HTMLElement).getByLabelText("Start Depth (m), row 1")).toHaveValue(150);
  });

  it("keeps an edit in memory and restores the sample for another drillhole", async () => {
    const user = userEvent.setup();
    render(<RawExtraction />);
    await chooseDrillhole(user, "ZOOV_1410_1");

    const mudLayer = screen.getByLabelText("Mud Layer (%), row 1");
    await user.type(mudLayer, "12.5");
    expect(screen.getByLabelText("Mud Layer (%), row 1")).toHaveValue(12.5);

    await chooseDrillhole(user, "ZOOV_1411_1");
    expect(screen.getByLabelText("Mud Layer (%), row 1")).toHaveValue(null);
  });
});
