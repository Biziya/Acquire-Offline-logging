import { describe, expect, it, vi } from "vitest";
import type { RawLithoDocument } from "../src/types/domain";
import { DraftSaveQueue } from "../src/services/IndexDB/rawLithoSaveQueue";
import { createBlankDocument, editRow } from "../src/pages/RawLitho/rawLithoDocumentOperations";
import { deferred } from "./deferred";

function fixtures() {
  const original = createBlankDocument({ drillhole: "A" });
  return {
    original,
    earlier: editRow(original, 1, "lithoFrom", "10"),
    imported: editRow(original, 1, "lithoFrom", "50"),
    newer: editRow(original, 1, "lithoFrom", "99"),
  };
}

describe("one-shot import ordering", () => {
  it("retains earlier unsaved edits when their save fails, without queuing the import", async () => {
    const { earlier, imported } = fixtures();
    const write = vi.fn<(key: string, draft: RawLithoDocument) => Promise<void>>().mockRejectedValueOnce(new Error("quota")).mockResolvedValue(undefined);
    const queue = new DraftSaveQueue(write);
    queue.stage("A", earlier);
    expect(await queue.commitImport("A", imported)).toMatchObject({ status: "failed" });
    expect(queue.peek("A")).toBe(earlier);
    expect(await queue.flushAll()).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls.every(([, draft]) => draft === earlier)).toBe(true);
  });

  it("leaves the successfully saved earlier draft in storage when the import write fails", async () => {
    const { earlier, imported } = fixtures();
    const stored = new Map<string, RawLithoDocument>();
    const write = vi.fn(async (key: string, draft: RawLithoDocument) => {
      if (draft === imported) throw new Error("failed import");
      stored.set(key, draft);
    });
    const queue = new DraftSaveQueue(write);
    queue.stage("A", earlier);
    expect(await queue.commitImport("A", imported)).toMatchObject({ status: "failed" });
    expect(stored.get("A")).toBe(earlier);
    expect(queue.peek("A")).toBeUndefined();
    queue.stage("B", createBlankDocument({ drillhole: "B" }));
    await queue.flushAll();
    expect(stored.get("A")).toBe(earlier);
    expect(write.mock.calls.filter(([, draft]) => draft === imported)).toHaveLength(1);
  });

  it("cancels a waiting import without discarding the old in-flight save", async () => {
    const { earlier, imported } = fixtures();
    const oldWrite = deferred<void>();
    const write = vi.fn<(key: string, draft: RawLithoDocument) => Promise<void>>().mockImplementationOnce(() => oldWrite.promise).mockResolvedValue(undefined);
    const queue = new DraftSaveQueue(write);
    queue.stage("A", earlier);
    const oldSave = queue.flush("A");
    const controller = new AbortController();
    const importing = queue.commitImport("A", imported, { signal: controller.signal });
    controller.abort();
    expect(queue.peek("A")).toBe(earlier);
    oldWrite.resolve();
    expect(await oldSave).toBe(true);
    expect(await importing).toEqual({ status: "cancelled" });
    await queue.flushAll();
    expect(write).toHaveBeenCalledExactlyOnceWith("A", earlier);
  });

  it("requires renewed confirmation if a newer edit arrives while the import waits", async () => {
    const { earlier, imported, newer } = fixtures();
    const oldWrite = deferred<void>();
    const write = vi.fn<(key: string, draft: RawLithoDocument) => Promise<void>>().mockImplementationOnce(() => oldWrite.promise).mockResolvedValue(undefined);
    const queue = new DraftSaveQueue(write);
    queue.stage("A", earlier);
    const oldSave = queue.flush("A");
    const importing = queue.commitImport("A", imported);
    queue.stage("A", newer);
    oldWrite.resolve();
    await oldSave;
    expect(await importing).toMatchObject({ status: "failed", message: expect.stringContaining("draft changed") });
    expect(write.mock.calls.map(([, draft]) => draft)).toEqual([earlier, newer]);
  });

  it("preserves a newer snapshot staged during the import write and does not report cancellation after submission", async () => {
    const { imported, newer } = fixtures();
    const importWrite = deferred<void>();
    const started = deferred<void>();
    const write = vi.fn<(key: string, draft: RawLithoDocument) => Promise<void>>().mockImplementationOnce(() => importWrite.promise).mockResolvedValue(undefined);
    const queue = new DraftSaveQueue(write);
    const controller = new AbortController();
    const importing = queue.commitImport("A", imported, { signal: controller.signal, onWriteStarted: started.resolve });
    await started.promise;
    queue.stage("A", newer);
    controller.abort();
    expect(queue.peek("A")).toBe(newer);
    const flushing = queue.flush("A");
    importWrite.resolve();
    expect(await importing).toEqual({ status: "completed" });
    expect(await flushing).toBe(true);
    expect(write.mock.calls.map(([, draft]) => draft)).toEqual([imported, newer]);
  });

  it("keeps a newer edit available if both the import and subsequent save fail", async () => {
    const { imported, newer } = fixtures();
    const importWrite = deferred<void>();
    const started = deferred<void>();
    const write = vi.fn<(key: string, draft: RawLithoDocument) => Promise<void>>().mockImplementationOnce(() => importWrite.promise).mockRejectedValueOnce(new Error("still unavailable")).mockResolvedValue(undefined);
    const queue = new DraftSaveQueue(write);
    const importing = queue.commitImport("A", imported, { onWriteStarted: started.resolve });
    await started.promise;
    queue.stage("A", newer);
    importWrite.reject(new Error("import unavailable"));
    expect(await importing).toMatchObject({ status: "failed" });
    expect(queue.peek("A")).toBe(newer);
    expect(await queue.flushAll()).toBe(false);
    expect(queue.peek("A")).toBe(newer);
    expect(await queue.flushAll()).toBe(true);
    expect(write).toHaveBeenLastCalledWith("A", newer);
  });
});
