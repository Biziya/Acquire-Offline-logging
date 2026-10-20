import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawLithoDocument } from "../src/types/domain";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import { createBlankDocument } from "../src/pages/RawLitho/rawLithoDocumentOperations";
import { rawLithoSaveQueue } from "../src/services/IndexDB/rawLithoSaveQueue";
import * as db from "../src/services/IndexDB/rawLithoDraftDb";
vi.mock("../src/services/IndexDB/rawLithoDraftDb", () => ({
  buildRawLithoDraftKey: (key: unknown) =>
    typeof key === "string" && key.trim() ? key.trim() : null,
  readRawLithoDraft: vi.fn(),
  writeRawLithoDraft: vi.fn(),
  readRawLithoSession: vi.fn(),
  writeRawLithoSession: vi.fn(),
}));
const stored = new Map<string, RawLithoDocument>();
const holes = ["A", "B"].map((holeId) => ({
  holeId,
  projectCode: "P",
  campaign: "C",
}));
const notify = vi.fn();
function mount() {
  return renderHook(
    () => useRawLithoWorkspace({ drillholes: holes, showToast: notify }),
    { wrapper: StrictMode },
  );
}
async function select(result: ReturnType<typeof mount>["result"], key: string) {
  act(() => result.current.selectDrillhole(key));
  await waitFor(() => expect(result.current.isPageEnabled).toBe(true));
}
beforeEach(() => {
  stored.clear();
  vi.mocked(db.readRawLithoSession).mockResolvedValue(null);
  vi.mocked(db.writeRawLithoSession).mockResolvedValue();
  vi.mocked(db.readRawLithoDraft).mockImplementation(async (key) =>
    key ? stored.get(key) : null,
  );
  vi.mocked(db.writeRawLithoDraft).mockImplementation(async (key, document) => {
    if (key) stored.set(key, document);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.mocked(db.writeRawLithoDraft).mockResolvedValue();
  await rawLithoSaveQueue.flushAll();
  vi.restoreAllMocks();
});
describe("workspace persistence regression", () => {
  it("saves an edit when switching drillholes in the same React batch", async () => {
    const { result } = mount();
    await select(result, "A");
    act(() => {
      result.current.updateRow(1, "lithoFrom", "42");
      result.current.selectDrillhole("B");
    });
    await waitFor(() =>
      expect(result.current.rawLithoDocument.drillhole).toBe("B"),
    );
    await waitFor(() => expect(stored.get("A")?.rows[0]?.lithoFrom).toBe("42"));
    await select(result, "A");
    expect(result.current.rows[0]?.lithoFrom).toBe("42");
  });
  it("keeps a failed load disabled without writing a blank, then retries safely", async () => {
    stored.set("A", createBlankDocument({ drillhole: "A", rows: [] }));
    vi.mocked(db.readRawLithoDraft).mockRejectedValueOnce(
      new Error("read failed"),
    );
    const { result } = mount();
    act(() => result.current.selectDrillhole("A"));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    act(() => result.current.updateRow(1, "lithoTo", "77"));
    expect(result.current.isPageEnabled).toBe(false);
    expect(db.writeRawLithoDraft).not.toHaveBeenCalled();
    act(() => result.current.retryDraftLoad());
    await waitFor(() => expect(result.current.isPageEnabled).toBe(true));
    expect(result.current.rows[0]?.lithoTo).toBe("");
  });
  it("rejects malformed stored drafts without overwriting them", async () => {
    vi.mocked(db.readRawLithoDraft).mockResolvedValue({
      drillhole: "A",
      rows: "corrupt",
    });
    const { result } = mount();
    act(() => result.current.selectDrillhole("A"));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.isPageEnabled).toBe(false);
    expect(db.writeRawLithoDraft).not.toHaveBeenCalled();
  });
  it("retains a failed save through a switch away and back, then retries", async () => {
    const { result } = mount();
    await select(result, "A");
    vi.mocked(db.writeRawLithoDraft).mockRejectedValue(new Error("quota"));
    act(() => result.current.updateRow(1, "lithoFrom", "88"));
    await act(async () => {
      expect(await result.current.flushPendingSaves()).toBe(false);
    });
    await select(result, "B");
    await select(result, "A");
    expect(result.current.rows[0]?.lithoFrom).toBe("88");
    vi.mocked(db.writeRawLithoDraft).mockImplementation(
      async (key, document) => {
        if (key) stored.set(key, document);
      },
    );
    await act(async () => {
      expect(await result.current.flushPendingSaves()).toBe(true);
    });
    expect(stored.get("A")?.rows[0]?.lithoFrom).toBe("88");
  });
  it("restores an existing legacy draft and session page with stable string IDs", async () => {
    vi.mocked(db.readRawLithoSession).mockResolvedValue({
      drillhole: "A",
      page: 2,
    });
    vi.mocked(db.readRawLithoDraft).mockResolvedValue({
      projectCode: "P",
      holeId: "A",
      rows: Array.from({ length: 51 }, (_, index) => ({
        id: `old-${index}`,
        lithoFrom: index,
        lithoTo: index + 1,
      })),
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.isPageEnabled).toBe(true));
    expect(result.current.currentPage).toBe(2);
    expect(result.current.rows[50]).toMatchObject({
      id: "old-50",
      lithoFrom: "50",
    });
    await act(async () => {
      await result.current.flushPendingSaves();
    });
    expect(stored.get("A")?.rows[50]?.id).toBe("old-50");
  });
  it("flushes edits on route unmount before the debounce timer", async () => {
    const { result, unmount } = mount();
    await select(result, "A");
    act(() => result.current.updateRow(1, "lithoFrom", "7"));
    unmount();
    await waitFor(() => expect(stored.get("A")?.rows[0]?.lithoFrom).toBe("7"));
  });
  it("ignores an old draft load that resolves after selecting another drillhole", async () => {
    let resolveA: (value: unknown) => void = () => {};
    vi.mocked(db.readRawLithoDraft).mockImplementation((key) =>
      key === "A"
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve(createBlankDocument({ drillhole: "B" })),
    );
    const { result } = mount();
    act(() => result.current.selectDrillhole("A"));
    await select(result, "B");
    await act(async () => resolveA(createBlankDocument({ drillhole: "A" })));
    expect(result.current.rawLithoDocument.drillhole).toBe("B");
    expect(result.current.isPageEnabled).toBe(true);
  });
});
