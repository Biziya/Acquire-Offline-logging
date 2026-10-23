import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DatabaseViewer from "../src/pages/DatabaseViewer/DatabaseViewer";
import type {
  DataViewerRecord,
  DataViewerResponse,
} from "../src/pages/DatabaseViewer/databaseViewerTypes";
import { buildDataViewerTable } from "../src/pages/DatabaseViewer/databaseViewerRows";
import { resetDataViewerState } from "../src/pages/DatabaseViewer/databaseViewerStore";
import { INDEX_COLUMN_WIDTH, tableColumns } from "../src/pages/RawLitho/constants";
import { getDataViewerRecords } from "../src/services/Api/dataViewerApi";
import { deferred } from "./deferred";
import { stubDesktopViewport } from "./viewport";

vi.mock("../src/services/Api/drillholeApi", () => ({
  getDrillholes: vi.fn(async () => [
    { holeId: "GTZO_0001_1", projectCode: "ZOOVCH", campaign: "2015" },
    { holeId: "GTZO_0002_1", projectCode: "ZOOVCH", campaign: "2016" },
  ]),
}));
vi.mock("../src/services/Api/dataViewerApi", () => ({
  getDataViewerRecords: vi.fn(),
}));

stubDesktopViewport();

function record(name: string, value: string | null, overrides: Partial<DataViewerRecord> = {}): DataViewerRecord {
  return {
    holeId: "GTZO_0001_1",
    projectCode: "ZOOVCH",
    from: 5,
    to: 10,
    priority: 1,
    name,
    value,
    commentValue: null,
    consistentCheck: null,
    usr: "DOMAIN\\bsarangerel",
    fileName: "yashgaa.json",
    pathName: null,
    createdAt: "2026-10-22T10:00:00",
    modifiedAt: null,
    importedBy: null,
    ...overrides,
  };
}

function response(drillhole: string, records: DataViewerRecord[], campaign: string | null = "2015"): DataViewerResponse {
  return { drillhole, project: "ZOOVCH", campaign, totalRecords: records.length, records };
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

describe("Database Viewer rows", () => {
  it("turns NAME / VALUE rows into one Raw Litho row per interval, values unchanged", () => {
    const table = buildDataViewerTable([
      record("LithoFacies", "0--"),
      record("Colour", "10G4/2"),
      record("RedoxFacies", "0042_MN1"),
      record("LithologyComments", null, { commentValue: "Fine  sand" }),
      record("OM", "0", { from: 10, to: 12.5 }),
      record("WellCAD_Extra", "x"),                                          // no Raw Litho column
      record("LithoFacies", "SS", { usr: "userAcquire" }),                   // another upload
    ]);

    expect(table.rows.map((row) => [row.lithoFrom, row.lithoTo, row.values])).toEqual([
      [5, 10, { lithoCode: "0--", colorCode: "10G4/2", redoxCode: "0042_MN1", lithologyComments: "Fine  sand" }],
      [10, 12.5, { om: "0" }],
      [5, 10, { lithoCode: "SS" }],
    ]);
    expect(table.hiddenValues).toBe(1);
    expect(table.storedBy).toEqual(["DOMAIN\\bsarangerel", "userAcquire"]);
    expect(table.fileNames).toEqual(["yashgaa.json"]);
  });
});

describe("Database Viewer page", () => {
  beforeEach(() => {
    vi.mocked(getDataViewerRecords).mockReset();
    resetDataViewerState();
  });

  it("uses exactly the Raw Litho table's headers and widths", async () => {
    vi.mocked(getDataViewerRecords).mockResolvedValue(
      response("GTZO_0001_1", [record("LithoFacies", "0--")]),
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
      response("GTZO_0001_1", [
        record("LithoFacies", "0--"),
        record("Colour", "10G4/2"),
        record("RedoxFacies", "0042_MN1"),
        record("Mystery", "?"),
      ]),
    );
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    expect(screen.getByText("No drillhole selected")).toBeInTheDocument();
    await chooseDrillhole(user, "GTZO_0001_1");

    expect(await screen.findByText("1 intervals · 4 stored values")).toBeInTheDocument();
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
      ca: "",
      omFacies: "",
    });

    // Read-only: plain text cells only.
    const table = screen.getByRole("region", { name: "Lithology records" });
    expect(table.querySelector("input, select, textarea, button")).toBeNull();
  });

  it("keeps the drillhole, records and scroll position after leaving the page, without a new request", async () => {
    const many = Array.from({ length: 400 }, (_, index) =>
      record("LithoFacies", `C${index}`, { from: index, to: index + 1 }),
    );
    vi.mocked(getDataViewerRecords).mockResolvedValue(response("GTZO_0001_1", many));
    const user = userEvent.setup();
    const first = render(<DatabaseViewer />);
    await chooseDrillhole(user, "GTZO_0001_1");
    await screen.findByText(/400 intervals/);

    const frame = screen.getByRole("region", { name: "Lithology records" });
    frame.scrollTop = 2800;
    frame.dispatchEvent(new Event("scroll"));
    first.unmount();                                   // navigate away

    const { container } = render(<DatabaseViewer />);  // and back
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

    pending.resolve(response("GTZO_0001_1", [record("LithoFacies", "0--")]));
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

    newer.resolve(response("GTZO_0002_1", [record("LithoFacies", "NEW", { holeId: "GTZO_0002_1" })], "2016"));
    await screen.findByText(/1 intervals/);
    older.resolve(response("GTZO_0001_1", [record("LithoFacies", "OLD")]));

    await waitFor(() => expect(fieldValue("Campaign")).toHaveTextContent("2016"));
    expect(rows(container)[0]).toHaveTextContent("NEW");
    expect(rows(container)[0]).not.toHaveTextContent("OLD");
  });

  it("treats a drillhole without stored records as an empty result", async () => {
    vi.mocked(getDataViewerRecords).mockResolvedValue(response("GTZO_0001_1", [], null));
    const user = userEvent.setup();
    render(<DatabaseViewer />);

    await chooseDrillhole(user, "GTZO_0001_1");

    expect(await screen.findByText("No records are stored for this drillhole.")).toBeInTheDocument();
    expect(fieldValue("Campaign")).toHaveTextContent("—");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a failed request with the shared error toast and can retry", async () => {
    vi.mocked(getDataViewerRecords)
      .mockRejectedValueOnce(new Error("Data Viewer request failed with HTTP 500."))
      .mockResolvedValueOnce(response("GTZO_0001_1", [record("LithoFacies", "0--")]));
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
