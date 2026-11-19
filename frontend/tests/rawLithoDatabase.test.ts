import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_STORE,
  isRawLithoDatabaseOutdated,
  readValue,
  resetRawLithoDatabaseOutdated,
  subscribeRawLithoDatabaseOutdated,
  writeValue,
} from "../src/services/IndexDB/rawLithoDatabase";

afterEach(() => {
  vi.restoreAllMocks();
  resetRawLithoDatabaseOutdated();
});

/* A hand-driven open request, to fire blocked / success in a chosen order. */
function stubOpen() {
  const request = {} as IDBOpenDBRequest & { result: IDBDatabase };
  vi.spyOn(indexedDB, "open").mockReturnValue(request);
  return request;
}

describe("raw-litho-db connection handling", () => {
  it("closes a connection that opens after the open was reported blocked", async () => {
    const request = stubOpen();
    const pending = readValue(DRAFT_STORE, "A");
    request.onblocked?.call(request, new Event("blocked") as IDBVersionChangeEvent);
    await expect(pending).rejects.toThrow("blocked");

    const close = vi.fn();
    Object.assign(request, { result: { close } });
    request.onsuccess?.call(request, new Event("success"));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes on versionchange and asks for a reload", async () => {
    let database: IDBDatabase | undefined;
    const realOpen = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, "open").mockImplementation((...args) => {
      const request = realOpen(...args);
      request.addEventListener("success", () => {
        database = request.result;
      });
      return request;
    });
    const listener = vi.fn();
    const unsubscribe = subscribeRawLithoDatabaseOutdated(listener);

    await writeValue(DRAFT_STORE, "A", { rows: [] });
    const close = vi.spyOn(database as IDBDatabase, "close");
    database?.onversionchange?.call(
      database,
      new Event("versionchange") as IDBVersionChangeEvent,
    );

    expect(close).toHaveBeenCalled();
    expect(isRawLithoDatabaseOutdated()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    // An outdated tab stops writing instead of failing in the middle.
    await expect(readValue(DRAFT_STORE, "A")).rejects.toThrow("Reload");
    unsubscribe();
  });

  it("asks for a reload when another tab already upgraded the schema", async () => {
    await writeValue(DRAFT_STORE, "B", { rows: [] });
    await new Promise<void>((resolve, reject) => {
      const upgrade = indexedDB.open("raw-litho-db", 99);
      upgrade.onsuccess = () => {
        upgrade.result.close();
        resolve();
      };
      upgrade.onerror = () => reject(upgrade.error);
    });

    await expect(readValue(DRAFT_STORE, "B")).rejects.toBeTruthy();
    expect(isRawLithoDatabaseOutdated()).toBe(true);
  });
});
