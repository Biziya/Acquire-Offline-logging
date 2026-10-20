import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UploadData from "../src/pages/UploadData/UploadData";
import { stubDesktopViewport } from "./viewport";
import { importUploadData } from "../src/services/Api/uploadData";
import { getCurrentWindowsUser } from "../src/services/currentUser";
import { applyCellEdits } from "../src/pages/UploadData/uploadDataDocument";
import {
  validateUploadDocument,
  type UploadLookups,
} from "../src/pages/UploadData/uploadDataValidation";

vi.mock("../src/services/Api/uploadData", () => ({
  importUploadData: vi.fn(async () => ({ message: "Upload confirmed" })),
}));
// Lookup data unavailable: codes are reported as unchecked, never guessed.
vi.mock("../src/services/Api/rawLithoApi", () => ({
  getRawLithoLookup: vi.fn(() => Promise.reject(new Error("offline"))),
}));
// No trusted identity by default, as in the real application today.
vi.mock("../src/services/currentUser", () => ({
  getCurrentWindowsUser: vi.fn(async () => null),
}));

function row(id: number, from: number, to: number) {
  return {
    id,
    lithoFrom: from,
    lithoTo: to,
    lithoCode: "SS",
    colorCode: "GRY",
    redoxCode: "OX",
    lithologyComments: "",
    custom: { keep: true },
  };
}

function uploadDocument() {
  return {
    project: "P1",
    campaign: "C1",
    drillhole: "DH-1",
    created_at: "2026-01-01T00:00:00.000Z",
    modified_at: "2026-01-02T00:00:00.000Z",
    extraMetadata: "kept",
    rows: [row(1, 0, 10), row(2, 10, 20)],
  };
}

stubDesktopViewport();

const unavailable: UploadLookups = { records: {}, state: {} };

describe("upload document validation", () => {
  it("separates blocking errors from warnings", () => {
    const valid = validateUploadDocument(uploadDocument(), unavailable);
    expect(valid.hasBlockingErrors).toBe(false);
    expect(valid.counts).toMatchObject({ total: 2, valid: 2, error: 0 });

    const broken = {
      ...uploadDocument(),
      project: "",
      rows: [row(1, 0, 10), row(2, 0, 10), { ...row(3, 30, 20), lithoCode: "" }],
    };
    const result = validateUploadDocument(broken, unavailable);
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.documentIssues.map((issue) => issue.message)).toContain(
      "Project is required.",
    );
    expect(result.rowStatus).toEqual(["error", "error", "error"]);
    expect(result.rowIssues[2]?.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(["Litho From is greater than Litho To.", "Litho Code is required."]),
    );
  });

  it("checks lookup codes only when the lookup data is available", () => {
    const lookups: UploadLookups = {
      records: { lithoCode: [{ lithoCode: "SS" }] },
      state: { lithoCode: "ready" },
    };
    const document = { ...uploadDocument(), rows: [{ ...row(1, 0, 10), lithoCode: "XX" }] };
    expect(validateUploadDocument(document, lookups).rowStatus).toEqual(["error"]);
    expect(validateUploadDocument(document, unavailable).rowStatus).toEqual(["valid"]);
  });

  it("edits only the changed row and keeps every other key and type", () => {
    const document = uploadDocument();
    const next = applyCellEdits(document, [
      { rowIndex: 0, field: "lithoTo", text: "12.5" },
      { rowIndex: 0, field: "lithologyComments", text: " two  spaces " },
    ]);
    expect(next.rows).not.toBe(document.rows);
    expect((next.rows as unknown[])[1]).toBe(document.rows[1]);
    expect((next.rows as unknown[])[0]).toEqual({
      ...row(1, 0, 12.5),
      lithologyComments: " two  spaces ",
    });
    expect(next.extraMetadata).toBe("kept");
    expect(applyCellEdits(document, [{ rowIndex: 0, field: "lithoTo", text: "10" }])).toBe(document);
  });
});

async function loadFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input missing");
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByLabelText("Lithology Comments, record 1");
}

const jsonFile = (value: unknown) =>
  new File([JSON.stringify(value)], "upload.json", { type: "application/json" });

async function confirmImport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Import Data" }));
  await user.click(screen.getByRole("button", { name: "Confirm import" }));
}

describe("Upload Data page", () => {
  beforeEach(() => vi.mocked(importUploadData).mockClear());

  it("uploads the original file when nothing was edited", async () => {
    const user = userEvent.setup();
    const file = jsonFile(uploadDocument());
    render(<UploadData />);
    await loadFile(file);

    expect(screen.getByText("Showing 2 of 2 records")).toBeInTheDocument();
    await confirmImport(user);
    expect(importUploadData).toHaveBeenCalledWith(file, expect.any(AbortSignal));
    expect(await screen.findByText("Upload confirmed")).toBeInTheDocument();
  });

  it("uploads the edited working document, with spaces and extra fields intact", async () => {
    const user = userEvent.setup();
    const file = jsonFile(uploadDocument());
    render(<UploadData />);
    await loadFile(file);

    const comment = screen.getByLabelText("Lithology Comments, record 2");
    await user.click(comment);
    await user.keyboard("Fine  grained sandstone ");
    expect(comment).toHaveValue("Fine  grained sandstone ");

    await confirmImport(user);
    const uploaded = vi.mocked(importUploadData).mock.calls[0]?.[0];
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded).not.toBe(file);
    const json = JSON.parse(await (uploaded as File).text());
    expect(json.extraMetadata).toBe("kept");
    expect(json.rows[1]).toEqual({
      ...row(2, 10, 20),
      lithologyComments: "Fine  grained sandstone ",
    });
  });

  it("blocks the upload while records have errors", async () => {
    const user = userEvent.setup();
    render(<UploadData />);
    await loadFile(jsonFile(uploadDocument()));

    fireEvent.change(screen.getByLabelText("Litho To (m), record 1"), {
      target: { value: "abc" },
    });
    await user.click(screen.getByRole("button", { name: "Import Data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Fix the blocking errors",
    );
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
    expect(importUploadData).not.toHaveBeenCalled();
  });

  it("moves with Tab and fills a Ctrl + click selection from one pasted value", async () => {
    const user = userEvent.setup();
    render(<UploadData />);
    await loadFile(jsonFile(uploadDocument()));

    await user.click(screen.getByLabelText("Litho From (m), record 1"));
    await user.tab();
    expect(screen.getByLabelText("Litho To (m), record 1")).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByLabelText("Litho From (m), record 1")).toHaveFocus();

    const first = screen.getByLabelText("Lithology Comments, record 1");
    const second = screen.getByLabelText("Lithology Comments, record 2");
    fireEvent.mouseDown(first, { ctrlKey: true });
    fireEvent.mouseDown(second, { ctrlKey: true });
    fireEvent.paste(second, { clipboardData: { getData: () => "clay  rich" } });
    expect(first).toHaveValue("clay  rich");
    expect(second).toHaveValue("clay  rich");
  });

  it("keeps the previous dataset out when a file is not valid JSON", async () => {
    render(<UploadData />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(["{"], "bad.json", { type: "application/json" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to read this JSON dataset",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Import Data" })).toBeDisabled(),
    );
  });
});

describe("Upload Data drag and drop", () => {
  beforeEach(() => vi.mocked(importUploadData).mockClear());

  const zone = () => screen.getByTestId("upload-drop-zone");
  const drag = (files: File[]) => ({ dataTransfer: { types: ["Files"], files } });

  it("highlights while dragging and loads a dropped file without uploading it", async () => {
    render(<UploadData />);
    const file = jsonFile(uploadDocument());

    fireEvent.dragEnter(zone(), drag([file]));
    expect(zone()).toHaveClass("upload-drop-zone--active");
    fireEvent.dragLeave(zone(), drag([file]));
    expect(zone()).not.toHaveClass("upload-drop-zone--active");

    fireEvent.dragOver(zone(), drag([file]));
    fireEvent.drop(zone(), drag([file]));
    expect(zone()).not.toHaveClass("upload-drop-zone--active");
    expect(await screen.findByLabelText("Lithology Comments, record 1")).toBeInTheDocument();
    expect(screen.getByText("Selected: upload.json")).toBeInTheDocument();
    expect(importUploadData).not.toHaveBeenCalled();
  });

  it("rejects several files or a non-JSON file and keeps the loaded dataset", async () => {
    render(<UploadData />);
    fireEvent.drop(zone(), drag([jsonFile(uploadDocument())]));
    await screen.findByLabelText("Lithology Comments, record 1");

    fireEvent.drop(zone(), drag([jsonFile({}), jsonFile({})]));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Drop one JSON file at a time.",
    );

    fireEvent.drop(zone(), drag([new File(["x"], "notes.txt", { type: "text/plain" })]));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      '"notes.txt" is not a JSON file.',
    );
    expect(screen.getByLabelText("Lithology Comments, record 1")).toBeInTheDocument();
    expect(screen.getByText("Selected: upload.json")).toBeInTheDocument();
  });

  it("stops the browser opening a file dropped beside the zone", () => {
    render(<UploadData />);
    const outside = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(outside, "dataTransfer", { value: { types: ["Files"] } });
    window.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(true);
  });
});

describe("Upload Data creator and uploader", () => {
  const CREATOR = "CORP\\creator";
  const UPLOADER = "CORP\\uploader";

  beforeEach(() => vi.mocked(importUploadData).mockClear());

  // The value shown next to a Dataset Information label.
  const summary = (label: string) =>
    screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

  it("shows the file's creator and marks a missing identity Unavailable", async () => {
    render(<UploadData />);
    await loadFile(jsonFile({ ...uploadDocument(), created_by: CREATOR }));
    expect(summary("Created By")).toBe(CREATOR);
    expect(summary("Uploaded By")).toBe("Unavailable");
  });

  it("shows Unavailable for a legacy file without created_by", async () => {
    render(<UploadData />);
    await loadFile(jsonFile(uploadDocument()));
    expect(summary("Created By")).toBe("Unavailable");
  });

  it("shows the trusted uploader separately and never changes the creator", async () => {
    vi.mocked(getCurrentWindowsUser).mockResolvedValueOnce(UPLOADER);
    const user = userEvent.setup();
    render(<UploadData />);
    await loadFile(jsonFile({ ...uploadDocument(), created_by: CREATOR }));
    await waitFor(() => expect(summary("Uploaded By")).toBe(UPLOADER));
    expect(summary("Created By")).toBe(CREATOR);

    // Edit, upload: the creator travels unchanged and no uploader is added.
    fireEvent.change(screen.getByLabelText("Lithology Comments, record 1"), {
      target: { value: "edited" },
    });
    await user.click(screen.getByRole("button", { name: "Import Data" }));
    await user.click(screen.getByRole("button", { name: "Confirm import" }));
    const uploaded = vi.mocked(importUploadData).mock.calls[0]?.[0] as File;
    const json = JSON.parse(await uploaded.text());
    expect(json.created_by).toBe(CREATOR);
    expect(JSON.stringify(json)).not.toContain("uploader");
  });
});
