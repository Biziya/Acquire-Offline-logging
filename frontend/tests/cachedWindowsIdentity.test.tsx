import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteValue, DRAFT_STORE, readValue, SESSION_STORE, writeValue } from "../src/services/IndexDB/rawLithoDatabase";
import { cacheVerifiedWindowsIdentity, readCachedWindowsIdentity } from "../src/services/IndexDB/windowsIdentityDb";

const account = "CORP\\cached";

async function loadHook() {
  return (await import("../src/hooks/useCachedWindowsIdentity")).useCachedWindowsIdentity;
}

function backend(name: string) {
  return new Response(JSON.stringify({ userName: name, fullUsername: name }));
}

describe("IndexedDB-backed identity display", () => {
  beforeEach(async () => {
    vi.resetModules();
    await deleteValue(SESSION_STORE, "windows-identity");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("restores the cached label before a backend response and keeps it after network failure", async () => {
    await cacheVerifiedWindowsIdentity(account, null);
    let reject!: (error: Error) => void;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((_resolve, fail) => {
      reject = fail;
    }));
    const { result } = renderHook(await loadHook());
    await waitFor(() => expect(result.current).toBe(account));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await act(async () => reject(new Error("network disconnected")));
    expect(result.current).toBe(account);
    expect((await readCachedWindowsIdentity())?.fullUsername).toBe(account);
  });

  it("restores on offline refresh and page remount without trusting the cache for metadata", async () => {
    await cacheVerifiedWindowsIdentity(account, null);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const first = renderHook(await loadHook());
    await waitFor(() => expect(first.result.current).toBe(account));
    first.unmount();
    vi.resetModules();
    const second = renderHook(await loadHook());
    await waitFor(() => expect(second.result.current).toBe(account));
    const { getCurrentWindowsUser } = await import("../src/services/currentUser");
    await expect(getCurrentWindowsUser()).resolves.toBeNull();
  });

  it("caches a first online identity including the local machine authority", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      userName: "local", fullUsername: "MACHINE\\local",
    })));
    const { result } = renderHook(await loadHook());
    await waitFor(() => expect(result.current).toBe("MACHINE\\local"));
    expect(await readValue(SESSION_STORE, "windows-identity")).toMatchObject({
      id: "current-user", domain: "MACHINE", username: "local", fullUsername: "MACHINE\\local",
    });
    const { getCurrentWindowsUser } = await import("../src/services/currentUser");
    await expect(getCurrentWindowsUser()).resolves.toBe("local");
  });

  it("synchronizes automatically on reconnect and preserves the result on authentication error", async () => {
    await cacheVerifiedWindowsIdentity(account, null);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const { result } = renderHook(await loadHook());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toBe(account));
    // Let the failed request finish before sending the recovery event.
    await act(async () => {});
    fetchSpy.mockImplementation(async () => backend("NEW\\person"));
    await act(async () => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current).toBe("NEW\\person"));
    const saved = await readCachedWindowsIdentity();
    expect(saved).toMatchObject({ domain: "NEW", username: "person", fullUsername: "NEW\\person" });
    fetchSpy.mockImplementation(async () => new Response("{}", { status: 401 }));
    await act(async () => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(result.current).toBe("NEW\\person");
    expect(await readCachedWindowsIdentity()).toEqual(saved);
  });

  it("retries backend outages without relying on the browser online event", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("backend stopped"));
    const { result } = renderHook(await loadHook());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await act(async () => {});
    fetchSpy.mockImplementation(async () => backend("CORP\\recovered"));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await waitFor(() => expect(result.current).toBe("CORP\\recovered"));
  });

  it("keeps an absent identity neutral when backend and storage are unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const { result } = renderHook(await loadHook());
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it("does not publish an uncached user if a write fails", async () => {
    await cacheVerifiedWindowsIdentity(account, null);
    const db = await import("../src/services/IndexDB/rawLithoDatabase");
    vi.spyOn(db, "writeValue").mockRejectedValue(new Error("QuotaExceededError"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => backend("CORP\\new"));
    const { result } = renderHook(await loadHook());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBe(account);
    expect((await readCachedWindowsIdentity())?.fullUsername).toBe(account);
  });

  it("upgrades the existing record in place and avoids writes for unchanged identities", async () => {
    await writeValue(SESSION_STORE, "windows-identity", {
      domain: "CORP", username: "cached", lastUpdated: "2025-01-01T00:00:00.000Z",
    });
    await writeValue(DRAFT_STORE, "preserved", { rows: ["untouched"] });
    const migrated = await readCachedWindowsIdentity();
    expect(migrated).toEqual({ id: "current-user", domain: "CORP", username: "cached",
      fullUsername: account, lastUpdated: "2025-01-01T00:00:00.000Z" });
    expect(await readValue(SESSION_STORE, "windows-identity")).toEqual(migrated);
    await cacheVerifiedWindowsIdentity(account, migrated);
    expect(await readCachedWindowsIdentity()).toEqual(migrated);
    expect(await readValue(DRAFT_STORE, "preserved")).toEqual({ rows: ["untouched"] });
  });
});
