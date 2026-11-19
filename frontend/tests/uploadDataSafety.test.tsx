import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UploadData from "../src/pages/UploadData/UploadData";
import { stubDesktopViewport } from "./viewport";
import { deferred } from "./deferred";
import { importUploadData } from "../src/services/Api/uploadData";
import {
  validateUploadDocument,
  type UploadLookups,
} from "../src/pages/UploadData/uploadDataValidation";
import { clearUploadDataDraft } from "../src/services/IndexDB/uploadDataDraftDb";

/*
 * Ways the Upload Data page could lose work: a bad replacement file, an
 * upload cut short, a depth losing its typed dot, a record the server would
 * refuse, and a file too large for the server.
 */

vi.mock("../src/services/Api/uploadData", () => ({
  importUploadData: vi.fn(async () => ({ message: "Upload confirmed" })),
}));
vi.mock("../src/services/Api/rawLithoApi", () => ({
  getRawLithoLookup: vi.fn(() => Promise.reject(new Error("offline"))),
}));
vi.mock("../src/services/currentUser", () => ({
  getCurrentWindowsUser: vi.fn(async () => null),
  getVerifiedWindowsIdentity: vi.fn(async () => ({ userName: "BDOM\\jsmith", fullUsername: "BDOM\\jsmith" })),
}));

function row(id: number, from: number, to: number) {
  return { id, lithoFrom: from, lithoTo: to, lithoCode: "SS", colorCode: "GRY", redoxCode: "OX", lithologyComments: "" };
}

function uploadDocument(rows = [row(1, 0, 10), row(2, 10, 20)]) {
  return {
    project: "P1",
    campaign: "C1",
    drillhole: "DH-1",
    created_at: "2026-01-01T00:00:00.000Z",
    modified_at: "2026-01-02T00:00:00.000Z",
    rows,
  };
}

const jsonFile = (value: unknown, name = "upload.json") =>
  new File([JSON.stringify(value)], name, { type: "application/json" });

const zone = () => screen.getByTestId("upload-drop-zone");
const drop = (file: File) =>
  fireEvent.drop(zone(), { dataTransfer: { types: ["Files"], files: [file] } });
const comment = (record: number) => screen.getByLabelText(`Lithology Comments, record ${record}`);

async function loadFile(file: File) {
  drop(file);
  await screen.findByLabelText("Lithology Comments, record 1");
}

async function confirmImport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Upload to database" }));
  await user.click(screen.getByRole("button", { name: "Upload" }));
}

stubDesktopViewport();

beforeEach(async () => {
  await clearUploadDataDraft();
  vi.mocked(importUploadData).mockClear();
});

const unavailable: UploadLookups = { records: {}, state: {} };

describe("missing depths", () => {
  it("blocks a record without Litho From or Litho To, as the server does", () => {
    const { lithoFrom: _dropped, ...noFrom } = row(1, 0, 10);
    void _dropped;
    const result = validateUploadDocument(
      uploadDocument([noFrom as ReturnType<typeof row>, { ...row(2, 10, 20), lithoTo: null as unknown as number }]),
      unavailable,
    );

    expect(result.hasBlockingErrors).toBe(true);
    expect(result.rowStatus).toEqual(["error", "error"]);
    expect(result.rowIssues[0]).toContainEqual({ severity: "error", field: "lithoFrom", message: "Litho From (m) is required." });
    expect(result.rowIssues[1]).toContainEqual({ severity: "error", field: "lithoTo", message: "Litho To (m) is required." });
    // Reported once, not again as a warning.
    expect(result.rowIssues[0]?.filter((issue) => issue.field === "lithoFrom")).toHaveLength(1);
  });
});

describe("typing a depth", () => {
  it("keeps the typed dot while editing and uploads the number", async () => {
    const user = userEvent.setup();
    render(<UploadData />);
    await loadFile(jsonFile(uploadDocument()));

    const to = screen.getByLabelText("Litho To (m), record 1");
    await user.click(to);
    await user.clear(to);
    await user.keyboard("12.");
    expect(to).toHaveValue("12.");
    await user.keyboard("5");
    expect(to).toHaveValue("12.5");
    await user.keyboard("0");
    expect(to).toHaveValue("12.50");

    // Leaving the cell shows the stored number.
    await user.tab();
    expect(to).toHaveValue("12.5");

    await confirmImport(user);
    const sent = vi.mocked(importUploadData).mock.calls[0]?.[0] as File;
    const uploaded = JSON.parse(await sent.text());
    expect(uploaded.rows[0].lithoTo).toBe(12.5);
  });
});

describe("choosing another file", () => {
  it("refuses a file over 10 MB without reading it", async () => {
    render(<UploadData />);
    await loadFile(jsonFile(uploadDocument()));

    const big = jsonFile(uploadDocument(), "big.json");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    const read = vi.spyOn(big, "text");
    drop(big);

    expect(await screen.findByRole("alert")).toHaveTextContent("The limit is 10.0 MB");
    expect(read).not.toHaveBeenCalled();
    expect(within(zone()).getByText("upload.json")).toBeInTheDocument();
  });

  it("keeps the edited document when the new file is not valid JSON", async () => {
    render(<UploadData />);
    await loadFile(jsonFile(uploadDocument()));
    fireEvent.change(comment(2), { target: { value: "my edit" } });

    drop(new File(["{"], "broken.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This file isn't valid JSON");
    expect(comment(2)).toHaveValue("my edit");
    expect(within(zone()).getByText("upload.json")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks before replacing edits; Keep editing keeps them, Replace loads the file", async () => {
    const user = userEvent.setup();
    render(<UploadData />);
    await loadFile(jsonFile(uploadDocument()));
    fireEvent.change(comment(2), { target: { value: "my edit" } });

    const next = jsonFile(uploadDocument([row(1, 0, 5), row(2, 5, 10), row(3, 10, 15)]), "second.json");
    drop(next);
    let dialog = await screen.findByRole("alertdialog", { name: "Replace the edited records?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(comment(2)).toHaveValue("my edit");
    expect(within(zone()).getByText("upload.json")).toBeInTheDocument();

    drop(next);
    dialog = await screen.findByRole("alertdialog", { name: "Replace the edited records?" });
    await user.click(within(dialog).getByRole("button", { name: "Replace" }));
    expect(await within(zone()).findByText("second.json")).toBeInTheDocument();
    expect(within(zone()).getByText("3 records")).toBeInTheDocument();
    expect(comment(2)).toHaveValue("");
  });
});

describe("during an upload", () => {
  it("locks Choose another file, drag and drop and Cancel", async () => {
    const pending = deferred<{ message: string }>();
    vi.mocked(importUploadData).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<UploadData />);
    await loadFile(jsonFile(uploadDocument()));

    await confirmImport(user);
    await waitFor(() => expect(importUploadData).toHaveBeenCalled());

    expect(within(zone()).getByRole("button", { name: "Choose another file" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    fireEvent.dragOver(zone(), { dataTransfer: { types: ["Files"], files: [] } });
    expect(zone()).not.toHaveClass("upload-drop-zone--active");
    drop(jsonFile(uploadDocument([row(1, 0, 1)]), "second.json"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wait for the upload to finish");
    expect(within(zone()).getByText("upload.json")).toBeInTheDocument();

    const signal = vi.mocked(importUploadData).mock.calls[0]?.[2] as AbortSignal;
    expect(signal.aborted).toBe(false);

    pending.resolve({ message: "Data uploaded successfully." });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
    expect(within(zone()).getByRole("button", { name: "Choose another file" })).toBeEnabled();
  });
});
