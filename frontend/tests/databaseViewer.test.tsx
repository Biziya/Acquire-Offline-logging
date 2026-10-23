import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DatabaseViewer from "../src/pages/DatabaseViewer/DatabaseViewer";
import type {
  DataViewerRecord,
  DataViewerResponse,
} from "../src/pages/DatabaseViewer/databaseViewerTypes";
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

function record(overrides: Partial<DataViewerRecord> = {}): DataViewerRecord {
  return {
    holeId: "GTZO_0001_1",
    projectCode: "ZOOVCH",
    from: 5,
    to: 10.125,
    priority: 1,
    name: "LithoFacies",
    value: "0--",
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

const fieldValue = (label: string) => screen.getByText(label).nextElementSibling;

async function chooseDrillhole(user: ReturnType<typeof userEvent.setup>, holeId: string) {
  const input = screen.getByRole("combobox", { name: "Drillhole" });
  await waitFor(() => expect(input).toBeEnabled());
  await user.clear(input);
  await user.type(input, holeId);
  await user.click(screen.getByRole("option", { name: holeId }));
}

describe("Database Viewer page", () => {
  beforeEach(() => vi.mocked(getDataViewerRecords).mockReset());

  it("loads the selected drillhole's stored records with its Project and Campaign", async () => {
    vi.mocked(getDataViewerRecords).mockResolvedValue(
      response("GTZO_0001_1", [record(), record({ name: "Colour", value: "10G4/2" })]),
    );
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    expect(screen.getByText("No drillhole selected")).toBeInTheDocument();
    expect(screen.getByText("Select a drillhole to view its records.")).toBeInTheDocument();
    expect(getDataViewerRecords).not.toHaveBeenCalled();

    await chooseDrillhole(user, "GTZO_0001_1");

    expect(await screen.findByText("2 records")).toBeInTheDocument();
    expect(getDataViewerRecords).toHaveBeenCalledWith("GTZO_0001_1", expect.any(AbortSignal));
    expect(fieldValue("Project")).toHaveTextContent("ZOOVCH");
    expect(fieldValue("Campaign")).toHaveTextContent("2015");

    expect(
      Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent),
    ).toEqual([
      "#", "HOLEID", "PROJECTCODE", "FROM", "TO", "PRIORITY", "NAME", "VALUE",
      "COMMENT_VALUE", "CONSISTENTCHECK", "usr", "FileName", "PathName",
      "Created_at", "Modified_at", "Imported_by",
    ]);

    // Stored values as they are: depths with at least two decimals (never
    // rounded), NULL as an empty cell, text unchanged.
    const cells = Array.from(rows(container)[0]!.children).map((cell) => cell.textContent);
    expect(cells).toEqual([
      "1", "GTZO_0001_1", "ZOOVCH", "5.00", "10.125", "1", "LithoFacies", "0--",
      "", "", "DOMAIN\\bsarangerel", "yashgaa.json", "", "2026-10-22T10:00:00", "", "",
    ]);
    expect(rows(container)[1]).toHaveTextContent("10G4/2");

    // Read-only: plain text cells only.
    const table = screen.getByRole("region", { name: "Database records" });
    expect(table.querySelector("input, select, textarea, button")).toBeNull();
  });

  it("shows only the latest selection when an older request answers last", async () => {
    const first = deferred<DataViewerResponse>();
    const second = deferred<DataViewerResponse>();
    vi.mocked(getDataViewerRecords)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    await chooseDrillhole(user, "GTZO_0001_1");
    expect(screen.getByText("Loading records…", { selector: "p[aria-live]" })).toBeInTheDocument();
    const firstSignal = vi.mocked(getDataViewerRecords).mock.calls[0]![1]!;

    await chooseDrillhole(user, "GTZO_0002_1");
    expect(firstSignal.aborted).toBe(true);

    second.resolve(response("GTZO_0002_1", [record({ holeId: "GTZO_0002_1" })], "2016"));
    expect(await screen.findByText("1 records")).toBeInTheDocument();
    first.resolve(response("GTZO_0001_1", [record(), record(), record()]));

    await waitFor(() => expect(fieldValue("Campaign")).toHaveTextContent("2016"));
    expect(rows(container)).toHaveLength(1);
    expect(rows(container)[0]).toHaveTextContent("GTZO_0002_1");
  });

  it("treats a drillhole without stored records as an empty result", async () => {
    vi.mocked(getDataViewerRecords).mockResolvedValue(response("GTZO_0001_1", [], null));
    const user = userEvent.setup();
    render(<DatabaseViewer />);

    await chooseDrillhole(user, "GTZO_0001_1");

    expect(await screen.findByText("0 records")).toBeInTheDocument();
    expect(screen.getByText("No records are stored for this drillhole.")).toBeInTheDocument();
    expect(fieldValue("Campaign")).toHaveTextContent("—");   // null: shown as unknown, not guessed
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a failed request with the shared error toast and can retry", async () => {
    vi.mocked(getDataViewerRecords)
      .mockRejectedValueOnce(new Error("Data Viewer request failed with HTTP 500."))
      .mockResolvedValueOnce(response("GTZO_0001_1", [record()]));
    const user = userEvent.setup();
    render(<DatabaseViewer />);

    await chooseDrillhole(user, "GTZO_0001_1");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load drillhole records");
    expect(screen.getByText("Records unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1 records")).toBeInTheDocument();
    expect(getDataViewerRecords).toHaveBeenCalledTimes(2);
  });

  it("renders only a window of a large drillhole", async () => {
    const many = Array.from({ length: 5000 }, (_, index) =>
      record({ from: index, to: index + 1 }),
    );
    vi.mocked(getDataViewerRecords).mockResolvedValue(response("GTZO_0001_1", many));
    const user = userEvent.setup();
    const { container } = render(<DatabaseViewer />);

    await chooseDrillhole(user, "GTZO_0001_1");

    expect(await screen.findByText("5,000 records")).toBeInTheDocument();
    expect(rows(container).length).toBeGreaterThan(0);
    expect(rows(container).length).toBeLessThan(100);
    expect(within(rows(container)[0] as HTMLElement).getAllByRole("cell")[3]).toHaveTextContent("0.00");
  });
});
