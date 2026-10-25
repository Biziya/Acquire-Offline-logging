import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DatabaseViewer from "../src/pages/DatabaseViewer/DatabaseViewer";
import type {
  DataViewerInterval,
  DataViewerResponse,
} from "../src/pages/DatabaseViewer/databaseViewerTypes";
import { resetDataViewerState } from "../src/pages/DatabaseViewer/databaseViewerStore";
import { resetDataViewerDrillholes } from "../src/pages/DatabaseViewer/useDataViewerDrillholes";
import { INDEX_COLUMN_WIDTH, tableColumns } from "../src/pages/RawLitho/constants";
import { getDrillholes } from "../src/services/Api/drillholeApi";
import {
  getDataViewerDrillholes,
  getDataViewerRecords,
} from "../src/services/Api/dataViewerApi";
import { deferred } from "./deferred";
import { stubDesktopViewport } from "./viewport";

// Raw Litho's list must not be used here.
vi.mock("../src/services/Api/drillholeApi", () => ({
  getDrillholes: vi.fn(async () => [{ holeId: "NOT_STORED", projectCode: "P", campaign: "C" }]),
}));
vi.mock("../src/services/Api/dataViewerApi", () => ({
  getDataViewerDrillholes: vi.fn(),
  getDataViewerRecords: vi.fn(),
}));

stubDesktopViewport();

function interval(
  values: DataViewerInterval["values"],
  overrides: Partial<DataViewerInterval> = {},
): DataViewerInterval {
  return {
    projectCode: "ZOOVCH",
    lithoFrom: 5,
    lithoTo: 10,
    priority: 1,
    usr: "DOMAIN\\bsarangerel",
    values,
    ...overrides,
  };
}

function response(
  drillhole: string,
  intervals: DataViewerInterval[],
  campaign: string | null = "2015",
  overrides: Partial<DataViewerResponse> = {},
): DataViewerResponse {
  const stored = intervals.length > 0;

  return {
    drillhole,
    project: stored ? "ZOOVCH" : null,
    campaign: stored ? campaign : null,
    projects: stored ? [{ projectCode: "ZOOVCH", campaign }] : [],
    totalIntervals: intervals.length,
    totalRecords: intervals.reduce((sum, item) => sum + Object.keys(item.values).length, 0),
    hiddenValues: 0,
    storedBy: stored ? ["DOMAIN\\bsarangerel"] : [],
    fileNames: stored ? ["yashgaa.json"] : [],
    intervals,
    ...overrides,
  };
}

const rows = (container: HTMLElement) =>
  container.querySelectorAll("tbody tr[aria-rowindex]");

const cellTexts = (row: Element | undefined) =>
  Array.from(row?.children ?? []).map((cell) => cell.textContent);

const fieldValue = (label: string) => screen.getByText(label).nextElementSibling;

async function chooseDrillhole(user: ReturnType<typeof userEvent.setup>, holeId: string) {
  const input = screen.getByRole("combobox", { name: "Drillhole" });
  await waitFor(() => expect(input).toBeEnabled());
  await user.clear(input);
  await user.type(input, holeId);
  await user.click(screen.getByRole("option", { name: holeId }));
}

describe("Database Viewer page", () => {
  beforeEach(() => {
    vi.mocked(getDataViewerRecords).mockReset();
    vi.mocked(getDataViewerDrillholes).mockReset();
    vi.mocked(getDataViewerDrillholes).mockResolvedValue(["GTZO_0001_1", "GTZO_0002_1"]);
    resetDataViewerState();
    resetDataViewerDrillholes();
  });

  it("offers exactly the drillholes stored in CoreDescrData", async () => {
    const user = userEvent.setup();
    render(<DatabaseViewer />);

    const input = screen.getByRole("combobox", { name: "Drillhole" });
    await waitFor(() => expect(input).toBeEnabled());
    await user.click(input);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "GTZO_0001_1",
      "GTZO_0002_1",
    ]);
    expect(screen.queryByText("Recent Working Drillholes")).toBeNull();
    expect(getDrillholes).not.toHaveBeenCalled();
  });

  it("reports a drillhole list that cannot be loaded", async () => {
    vi.mocked(getDataViewerDrillholes).mockRejectedValue(new Error("HTTP 500"));
    render(<DatabaseViewer />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load drillholes");
    expect(screen.getByRole("combobox", { name: "Drillhole" })).toBeDisabled();
  });

  it("uses exactly the Raw Litho table's headers and widths", async () => {
    vi.mocked(getDataViewerRecords).mockResolvedValue(
      response("GTZO_0001_1", [interval({ lithoCode: "0--" })]),
    );
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);
    await chooseDrillhole(user, "GTZO_0001_1");
    await screen.findByText(/1 intervals/);

    const headers = Array.from(container.querySelectorAll("thead th"));
    expect(headers.map((th) => th.textContent)).toEqual([
      "Ins",
      ...tableColumns.map((column) => column.label),
    ]);
    // Compared as numbers: the browser writes "6.900%" back as "6.9%".
    expect(headers.map((th) => parseFloat((th as HTMLElement).style.width))).toEqual(
      [INDEX_COLUMN_WIDTH, ...tableColumns.map((column) => column.width)].map((width) =>
        parseFloat(String(width)),
      ),
    );
  });

  it("shows each interval in the Raw Litho columns with Project and Campaign", async () => {
    vi.mocked(getDataViewerRecords).mockResolvedValue(
      response(
        "GTZO_0001_1",
        [
          interval({
            lithoCode: "0--",
            colorCode: "10G4/2",
            redoxCode: "0042_MN1",
            lithologyComments: "Fine  sand",
            granulo: null,
          }),
        ],
        "2015",
        { totalRecords: 6, hiddenValues: 1 },
      ),
    );
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    expect(screen.getByText("No drillhole selected")).toBeInTheDocument();
    await chooseDrillhole(user, "GTZO_0001_1");

    expect(await screen.findByText("1 intervals · 6 stored values")).toBeInTheDocument();
    expect(fieldValue("Project")).toHaveTextContent("ZOOVCH");
    expect(fieldValue("Campaign")).toHaveTextContent("2015");
    expect(screen.getByRole("note")).toHaveTextContent("1 stored values have no Raw Litho column");
    expect(screen.getByText(/Stored by DOMAIN\\bsarangerel · File yashgaa\.json/)).toBeInTheDocument();

    const byKey = Object.fromEntries(
      ["index", ...tableColumns.map((column) => column.key)].map((key, index) => [
        key,
        cellTexts(rows(container)[0])[index],
      ]),
    );
    expect(byKey).toMatchObject({
      index: "1",
      lithoFrom: "5.00",
      lithoTo: "10.00",
      lithoCode: "0--",
      colorCode: "10G4/2",
      redoxCode: "0042_MN1",
      lithologyComments: "Fine  sand",
      granulo: "",
      ca: "",
      omFacies: "",
      py: "",
    });

    // Read-only: plain text cells only.
    const table = screen.getByRole("region", { name: "Lithology records" });
    expect(table.querySelector("input, select, textarea, button")).toBeNull();
  });

  it("lists every stored project instead of picking one", async () => {
    vi.mocked(getDataViewerRecords).mockResolvedValue(
      response(
        "GTZO_0001_1",
        [interval({ lithoCode: "SS" }), interval({ lithoCode: "CL" }, { projectCode: "OTHER" })],
        null,
        {
          project: null,
          campaign: null,
          projects: [
            { projectCode: "ZOOVCH", campaign: "2015" },
            { projectCode: "OTHER", campaign: null },
          ],
        },
      ),
    );
    const user = userEvent.setup();
    render(<DatabaseViewer />);
    await chooseDrillhole(user, "GTZO_0001_1");
    await screen.findByText(/2 intervals/);

    expect(fieldValue("Project")).toHaveTextContent("ZOOVCH, OTHER");
    expect(fieldValue("Campaign")).toHaveTextContent("2015, —");
  });

  it("keeps the drillhole, records and scroll position after leaving the page, without a new request", async () => {
    const many = Array.from({ length: 400 }, (_, index) =>
      interval({ lithoCode: `C${index}` }, { lithoFrom: index, lithoTo: index + 1 }),
    );
    vi.mocked(getDataViewerRecords).mockResolvedValue(response("GTZO_0001_1", many));
    const user = userEvent.setup();
    const first = render(<DatabaseViewer />);
    await chooseDrillhole(user, "GTZO_0001_1");
    await screen.findByText(/400 intervals/);

    const frame = screen.getByRole("region", { name: "Lithology records" });
    frame.scrollTop = 2800;
    frame.dispatchEvent(new Event("scroll"));
    first.unmount(); // navigate away

    const { container } = render(<DatabaseViewer />); // and back
    expect(screen.getByText(/400 intervals/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Drillhole" })).toHaveValue("GTZO_0001_1");
    expect(fieldValue("Campaign")).toHaveTextContent("2015");
    expect(screen.getByRole("region", { name: "Lithology records" }).scrollTop).toBe(2800);
    expect(rows(container).length).toBeGreaterThan(0);
    expect(getDataViewerRecords).toHaveBeenCalledTimes(1);
  });

  it("finishes a request that was still running when the page was left", async () => {
    const pending = deferred<DataViewerResponse>();
    vi.mocked(getDataViewerRecords).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    const first = render(<DatabaseViewer />);
    await chooseDrillhole(user, "GTZO_0001_1");
    first.unmount();

    pending.resolve(response("GTZO_0001_1", [interval({ lithoCode: "0--" })]));
    render(<DatabaseViewer />);

    expect(await screen.findByText(/1 intervals/)).toBeInTheDocument();
    expect(getDataViewerRecords).toHaveBeenCalledTimes(1);
  });

  it("shows only the latest selection when an older request answers last", async () => {
    const older = deferred<DataViewerResponse>();
    const newer = deferred<DataViewerResponse>();
    vi.mocked(getDataViewerRecords)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    await chooseDrillhole(user, "GTZO_0001_1");
    const olderSignal = vi.mocked(getDataViewerRecords).mock.calls[0]![1]!;
    await chooseDrillhole(user, "GTZO_0002_1");
    expect(olderSignal.aborted).toBe(true);

    newer.resolve(response("GTZO_0002_1", [interval({ lithoCode: "NEW" })], "2016"));
    await screen.findByText(/1 intervals/);
    older.resolve(response("GTZO_0001_1", [interval({ lithoCode: "OLD" })]));

    await waitFor(() => expect(fieldValue("Campaign")).toHaveTextContent("2016"));
    expect(rows(container)[0]).toHaveTextContent("NEW");
    expect(rows(container)[0]).not.toHaveTextContent("OLD");
  });

  it("treats a drillhole without stored records as an empty result", async () => {
    vi.mocked(getDataViewerRecords).mockResolvedValue(response("GTZO_0001_1", []));
    const user = userEvent.setup();
    render(<DatabaseViewer />);

    await chooseDrillhole(user, "GTZO_0001_1");

    expect(await screen.findByText("No records are stored for this drillhole.")).toBeInTheDocument();
    expect(fieldValue("Project")).toHaveTextContent("—");
    expect(fieldValue("Campaign")).toHaveTextContent("—");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a failed request with the shared error toast and can retry", async () => {
    vi.mocked(getDataViewerRecords)
      .mockRejectedValueOnce(new Error("Data Viewer request failed with HTTP 500."))
      .mockResolvedValueOnce(response("GTZO_0001_1", [interval({ lithoCode: "0--" })]));
    const user = userEvent.setup();
    render(<DatabaseViewer />);

    await chooseDrillhole(user, "GTZO_0001_1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load drillhole records");
    expect(screen.getByText("Records unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/1 intervals/)).toBeInTheDocument();
    expect(getDataViewerRecords).toHaveBeenCalledTimes(2);
  });
});
