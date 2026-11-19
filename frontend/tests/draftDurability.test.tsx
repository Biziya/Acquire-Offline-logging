import { StrictMode } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawLithoDocument } from "../src/types/domain";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import { DRILLHOLE_LOCK_PREFIX } from "../src/pages/RawLitho/hooks/useDrillholeTabLock";
import RawLithoDraftStatusBanner from "../src/pages/RawLitho/RawLithoDraftStatusBanner";
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

/* An in-memory, exclusive-only stand-in for navigator.locks shared by "tabs". */
class FakeLockManager {
  private held = new Set<string>();
  private queues = new Map<string, (() => void)[]>();

  request(
    name: string,
    options: { signal?: AbortSignal },
    callback: (lock: { name: string }) => unknown,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const queue = this.queues.get(name) ?? [];
      this.queues.set(name, queue);
      const grant = () => {
        this.held.add(name);
        Promise.resolve()
          .then(() => callback({ name }))
          .then(resolve, reject)
          .finally(() => {
            this.held.delete(name);
            queue.shift()?.();
          });
      };
      if (!this.held.has(name) && queue.length === 0) {
        grant();
        return;
      }
      queue.push(grant);
      options.signal?.addEventListener("abort", () => {
        const index = queue.indexOf(grant);
        if (index < 0) return;
        queue.splice(index, 1);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }
}

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

function fireBeforeUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  stored.clear();
  notify.mockReset();
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
  Reflect.deleteProperty(navigator, "locks");
  vi.restoreAllMocks();
});

describe("failed draft saves", () => {
  it("shows a persistent banner and warns before unload until a retry saves", async () => {
    render(<RawLithoDraftStatusBanner />);
    const { result } = mount();
    act(() => result.current.selectDrillhole("A"));
    await waitFor(() => expect(result.current.isPageEnabled).toBe(true));
    expect(fireBeforeUnload()).toBe(false);

    vi.mocked(db.writeRawLithoDraft).mockRejectedValue(new Error("quota"));
    act(() => result.current.updateRow(1, "lithoFrom", "4"));

    await waitFor(() => expect(result.current.saveError).toBe(true));
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved on this PC");
    expect(fireBeforeUnload()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);

    vi.mocked(db.writeRawLithoDraft).mockImplementation(async (key, document) => {
      if (key) stored.set(key, document);
    });
    await waitFor(() => expect(result.current.saveError).toBe(false), {
      timeout: 4000,
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(stored.get("A")?.rows[0]?.lithoFrom).toBe("4");
    expect(fireBeforeUnload()).toBe(false);
  });

  it("warns before unload while an edit is still waiting to be written", async () => {
    const { result } = mount();
    act(() => result.current.selectDrillhole("A"));
    await waitFor(() => expect(result.current.isPageEnabled).toBe(true));

    act(() => result.current.updateRow(1, "lithoFrom", "7"));
    expect(fireBeforeUnload()).toBe(true);
    await waitFor(() => expect(stored.get("A")?.rows[0]?.lithoFrom).toBe("7"));
    expect(fireBeforeUnload()).toBe(false);
  });
});

describe("one editing tab per drillhole", () => {
  it("keeps a second tab read-only until the first lets go", async () => {
    const locks = new FakeLockManager();
    Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
    let releaseOtherTab = () => {};
    void locks.request(DRILLHOLE_LOCK_PREFIX + "A", {}, () =>
      new Promise<void>((resolve) => {
        releaseOtherTab = resolve;
      }),
    );
    stored.set("A", {
      ...(await import("../src/pages/RawLitho/rawLithoDocumentOperations"))
        .createBlankDocument({ drillhole: "A", project: "P", campaign: "C" }),
    });

    render(<RawLithoDraftStatusBanner />);
    const { result } = mount();
    act(() => result.current.selectDrillhole("A"));

    await waitFor(() => expect(result.current.isOpenElsewhere).toBe(true));
    // The draft is still shown, just not editable.
    await waitFor(() =>
      expect(result.current.rawLithoDocument.drillhole).toBe("A"),
    );
    expect(result.current.isPageEnabled).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent(
      "open in another tab or window",
    );

    act(() => result.current.updateRow(1, "lithoFrom", "9"));
    await rawLithoSaveQueue.flushAll();
    expect(db.writeRawLithoDraft).not.toHaveBeenCalled();

    act(() => releaseOtherTab());
    await waitFor(() => expect(result.current.isPageEnabled).toBe(true));
    expect(result.current.isOpenElsewhere).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => result.current.updateRow(1, "lithoFrom", "9"));
    await waitFor(() => expect(stored.get("A")?.rows[0]?.lithoFrom).toBe("9"));
  });

  it("lets a tab edit at once when no other tab holds the drillhole", async () => {
    Object.defineProperty(navigator, "locks", {
      value: new FakeLockManager(),
      configurable: true,
    });
    const { result } = mount();
    act(() => result.current.selectDrillhole("B"));
    await waitFor(() => expect(result.current.isPageEnabled).toBe(true));
    expect(result.current.isOpenElsewhere).toBe(false);
  });
});
