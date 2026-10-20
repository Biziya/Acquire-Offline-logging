import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawLithoDocument } from "../src/types/domain";
import { useRawLithoImport } from "../src/pages/RawLitho/hooks/useRawLithoImport";
import { createBlankDocument, editRow } from "../src/pages/RawLitho/rawLithoDocumentOperations";
import { rawLithoSaveQueue } from "../src/services/IndexDB/rawLithoSaveQueue";
import * as db from "../src/services/IndexDB/rawLithoDraftDb";
import { deferred } from "./deferred";

vi.mock("../src/services/IndexDB/rawLithoDraftDb", () => ({
  buildRawLithoDraftKey: (key: unknown) => typeof key === "string" && key.trim() ? key.trim() : null,
  readRawLithoDraft: vi.fn(), writeRawLithoDraft: vi.fn(), hasRawLithoDraft: vi.fn(),
}));

const stored = new Map<string, RawLithoDocument>();
const onImported = vi.fn();
const notify = vi.fn();
const imported = editRow(createBlankDocument({ drillhole: "A" }), 1, "lithoFrom", "50");
const earlier = editRow(imported, 1, "lithoFrom", "10");

function Harness({ selectionKey = "" }: { selectionKey?: string }) {
  const importer = useRawLithoImport({ lookupData: {}, onImported, showToast: notify, selectionKey });
  return <>
    <input type="file" aria-label="Import file" onChange={importer.selectFile} />
    <button onClick={importer.confirmImport}>Confirm</button>
    <button onClick={importer.cancelImport}>Cancel</button>
    <output data-testid="status">{importer.status}</output>
    <output data-testid="target">{importer.pendingImport?.drillhole ?? ""}</output>
  </>;
}

function fileFrom(read: () => Promise<string>): File {
  const file = new File([], "import.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: read });
  return file;
}

async function prepare(draft = imported) {
  fireEvent.change(screen.getByLabelText("Import file"), { target: { files: [fileFrom(async () => JSON.stringify(draft))] } });
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("pending"));
}

beforeEach(() => {
  stored.clear();
  vi.mocked(db.hasRawLithoDraft).mockImplementation(async key => key ? stored.has(key) : false);
  vi.mocked(db.readRawLithoDraft).mockImplementation(async key => key ? stored.get(key) : undefined);
  vi.mocked(db.writeRawLithoDraft).mockImplementation(async (key, draft) => { if (key) stored.set(key, draft); });
});

afterEach(async () => {
  vi.mocked(db.writeRawLithoDraft).mockResolvedValue();
  await rawLithoSaveQueue.flushAll();
});

describe("import lifecycle", () => {
  it("keeps a failed import out of restoration and background retries, then permits explicit retry", async () => {
    render(<Harness />, { wrapper: StrictMode });
    rawLithoSaveQueue.stage("A", earlier);
    vi.mocked(db.writeRawLithoDraft).mockImplementation(async (key, draft) => {
      if (draft.rows[0]?.lithoFrom === "50") throw new Error("quota");
      if (key) stored.set(key, draft);
    });
    await prepare();
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("failed"));
    expect(onImported).not.toHaveBeenCalled();
    expect(await db.readRawLithoDraft("A")).toEqual(earlier);
    expect(rawLithoSaveQueue.peek("A")).toBeUndefined();
    await rawLithoSaveQueue.flushAll();
    expect(await db.readRawLithoDraft("A")).toEqual(earlier);
    vi.mocked(db.writeRawLithoDraft).mockImplementation(async (key, draft) => { if (key) stored.set(key, draft); });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("completed"));
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(stored.get("A")?.rows[0]?.lithoFrom).toBe("50");
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByTestId("status")).toHaveTextContent("completed");
    expect(notify.mock.calls.some(([toast]) => toast.message === "Import cancelled")).toBe(false);
  });

  it("cancels a prepared import without touching earlier pending edits", async () => {
    render(<Harness />);
    rawLithoSaveQueue.stage("A", earlier);
    await prepare();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByTestId("status")).toHaveTextContent("cancelled");
    expect(rawLithoSaveQueue.peek("A")).toBe(earlier);
    await rawLithoSaveQueue.flushAll();
    expect(stored.get("A")).toEqual(earlier);
    expect(onImported).not.toHaveBeenCalled();
  });

  it("cancels while waiting for an older save and ignores its stale completion", async () => {
    const oldWrite = deferred<void>();
    vi.mocked(db.writeRawLithoDraft).mockImplementationOnce(() => oldWrite.promise);
    rawLithoSaveQueue.stage("A", earlier);
    const oldSave = rawLithoSaveQueue.flush("A");
    render(<Harness />);
    await prepare();
    fireEvent.click(screen.getByText("Confirm"));
    expect(screen.getByTestId("status")).toHaveTextContent("saving");
    fireEvent.click(screen.getByText("Cancel"));
    await act(async () => { oldWrite.resolve(); await oldSave; });
    expect(screen.getByTestId("status")).toHaveTextContent("cancelled");
    expect(onImported).not.toHaveBeenCalled();
    expect(db.writeRawLithoDraft).toHaveBeenCalledExactlyOnceWith("A", earlier);
  });

  it("refuses cancellation and duplicate confirmation after the write starts", async () => {
    const write = deferred<void>();
    vi.mocked(db.writeRawLithoDraft).mockImplementation(() => write.promise);
    render(<Harness />);
    await prepare();
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(db.writeRawLithoDraft).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByText("Confirm"));
    expect(screen.getByTestId("status")).toHaveTextContent("saving");
    expect(onImported).not.toHaveBeenCalled();
    await act(async () => write.resolve());
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("completed"));
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(db.writeRawLithoDraft).toHaveBeenCalledTimes(1);
  });

  it("ignores superseded and cancelled asynchronous file reads", async () => {
    render(<Harness />);
    const read = deferred<string>();
    fireEvent.change(screen.getByLabelText("Import file"), { target: { files: [fileFrom(() => read.promise)] } });
    await prepare(createBlankDocument({ drillhole: "B" }));
    await act(async () => read.resolve(JSON.stringify(imported)));
    expect(screen.getByTestId("target")).toHaveTextContent("B");
    const nextRead = deferred<string>();
    fireEvent.change(screen.getByLabelText("Import file"), { target: { files: [fileFrom(() => nextRead.promise)] } });
    fireEvent.click(screen.getByText("Cancel"));
    await act(async () => nextRead.resolve(JSON.stringify(imported)));
    expect(screen.getByTestId("status")).toHaveTextContent("cancelled");
    expect(screen.getByTestId("target")).toBeEmptyDOMElement();
    expect(db.writeRawLithoDraft).not.toHaveBeenCalled();
  });

  it("does not apply a submitted import to a newly selected drillhole", async () => {
    const write = deferred<void>();
    vi.mocked(db.writeRawLithoDraft).mockImplementation(async (key, draft) => { await write.promise; if (key) stored.set(key, draft); });
    const { rerender } = render(<Harness />);
    await prepare();
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(db.writeRawLithoDraft).toHaveBeenCalledTimes(1));
    rerender(<Harness selectionKey="B" />);
    await act(async () => write.resolve());
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(stored.get("A")?.rows[0]?.lithoFrom).toBe("50");
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not call UI completion after unmount", async () => {
    const write = deferred<void>();
    vi.mocked(db.writeRawLithoDraft).mockImplementation(() => write.promise);
    const { unmount } = render(<Harness />);
    await prepare();
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(db.writeRawLithoDraft).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => write.resolve());
    expect(onImported).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
