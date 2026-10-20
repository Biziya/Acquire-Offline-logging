import { describe, expect, it, vi } from "vitest";
import { DraftSaveQueue } from "../src/services/IndexDB/rawLithoSaveQueue";
import {
  createBlankDocument,
  editRow,
} from "../src/pages/RawLitho/rawLithoDocumentOperations";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("save queue", () => {
  it("serializes in-flight saves and drains a newer edit after the older one commits", async () => {
    const first = deferred();
    const write = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const queue = new DraftSaveQueue(write);
    const original = createBlankDocument({ drillhole: "A" });
    const newer = editRow(original, 1, "lithoFrom", "99");
    queue.stage("A", original);
    const pending = queue.flush("A");
    queue.stage("A", newer);
    expect(queue.flush("A")).toBe(pending);
    expect(write).toHaveBeenCalledTimes(1);
    first.resolve();
    expect(await pending).toBe(true);
    expect(write.mock.calls.map((call) => call[1])).toEqual([original, newer]);
    expect(queue.hasPending()).toBe(false);
  });
  it("retains the newest snapshot after a failure and retries it", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValue(undefined);
    const queue = new DraftSaveQueue(write);
    const original = createBlankDocument({ drillhole: "A" });
    queue.stage("A", original);
    expect(await queue.flushAll()).toBe(false);
    expect(queue.peek("A")).toBe(original);
    const newer = editRow(original, 1, "lithoTo", "20");
    queue.stage("A", newer);
    expect(await queue.flushAll()).toBe(true);
    expect(write).toHaveBeenLastCalledWith("A", newer);
    expect(queue.peek("A")).toBeUndefined();
  });
  it("keeps other drillhole edits while one save fails", async () => {
    const write = vi.fn(async (key: string) => {
      if (key === "A") throw new Error("failed");
    });
    const queue = new DraftSaveQueue(write);
    queue.stage("A", createBlankDocument({ drillhole: "A" }));
    queue.stage("B", createBlankDocument({ drillhole: "B" }));
    expect(await queue.flushAll()).toBe(false);
    expect(queue.peek("A")).toBeDefined();
    expect(queue.peek("B")).toBeUndefined();
  });
});
