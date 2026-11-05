import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCachedWindowsIdentity } from "../src/services/IndexDB/windowsIdentityDb";
import { SESSION_STORE, DRAFT_STORE, readValue, writeValue } from "../src/services/IndexDB/rawLithoDatabase";

// The shared request is module state, so each case loads a fresh copy.
async function loadGetUser() {
  vi.resetModules();
  return (await import("../src/services/currentUser")).getCurrentWindowsUser;
}

function respond(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(body), { status }),
  );
}

describe("current Windows user", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps backend identity available when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    respond(200, { userName: "CORP\\jdoe" });
    const getUser = await loadGetUser();
    await expect(getUser()).resolves.toBe("CORP\\jdoe");
  });

  it("persists verified identity across module reloads without rewriting unchanged data", async () => {
    const cached = { domain: "CORP", username: "jdoe", lastUpdated: "2025-01-01T00:00:00.000Z" };
    await writeValue(SESSION_STORE, "windows-identity", cached);
    await writeValue(DRAFT_STORE, "identity-preservation", { rows: ["existing"] });
    const fetchSpy = respond(200, { userName: "CORP\\jdoe" });
    const getUser = await loadGetUser();
    await Promise.all([getUser(), getUser()]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await readCachedWindowsIdentity()).toEqual(cached);
    const reloaded = await loadGetUser();
    await expect(reloaded()).resolves.toBe("CORP\\jdoe");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(await readCachedWindowsIdentity()).toEqual(cached);
    expect(await readValue(DRAFT_STORE, "identity-preservation")).toEqual({ rows: ["existing"] });
  });

  it("revalidates shared identity, updates changes, and never falls back to cache after 401", async () => {
    await writeValue(SESSION_STORE, "windows-identity", {
      domain: "OLD", username: "outdated", lastUpdated: "2025-01-01T00:00:00.000Z",
    });
    const fetchSpy = respond(200, { userName: "CORP\\jdoe" });
    const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
    const getUser = await loadGetUser();
    await expect(getUser()).resolves.toBe("CORP\\jdoe");
    expect(await readCachedWindowsIdentity()).toMatchObject({ domain: "CORP", username: "jdoe" });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ userName: "Bek" })));
    now.mockReturnValue(160_001);
    await expect(getUser()).resolves.toBe("Bek");
    const cached = await readCachedWindowsIdentity();
    expect(cached).toMatchObject({ domain: "", username: "Bek" });
    expect(Number.isFinite(Date.parse(cached!.lastUpdated))).toBe(true);
    fetchSpy.mockResolvedValue(new Response("{}", { status: 401 }));
    now.mockReturnValue(220_002);
    await expect(getUser()).resolves.toBeNull();
    expect(await readCachedWindowsIdentity()).toEqual(cached);
  });

  it("reads the verified name from /api/status?includeUser=true, once", async () => {
    const fetchSpy = respond(200, { status: "online", message: "ok", userName: " CORP\\jdoe " });
    const getUser = await loadGetUser();

    await expect(getUser()).resolves.toBe("CORP\\jdoe");
    await expect(getUser()).resolves.toBe("CORP\\jdoe");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/status?includeUser=true");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("never calls the removed /api/currentuser endpoint", async () => {
    const fetchSpy = respond(200, { userName: "Bek" });
    const getUser = await loadGetUser();

    await getUser();
    expect(fetchSpy.mock.calls.map((call) => call[0])).not.toContain("/api/currentuser");
  });

  it("asks again after a failed lookup, then keeps the verified name", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("backend not started"))
      .mockResolvedValue(new Response(JSON.stringify({ userName: "Bek" })));
    const getUser = await loadGetUser();

    await expect(getUser()).resolves.toBeNull();
    await expect(getUser()).resolves.toBe("Bek");
    await expect(getUser()).resolves.toBe("Bek");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("useCurrentUser shows the name once the backend starts, without a refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("backend not started"))
      .mockResolvedValue(new Response(JSON.stringify({ userName: "Bek" })));
    vi.resetModules();
    const { useCurrentUser } = await import("../src/hooks/useCurrentUser");

    const { result } = renderHook(() => useCurrentUser());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    await waitFor(() => expect(result.current).toBe("Bek"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it.each([
    ["a local account", "Bek"],
    ["a domain account", "COMPANY\\bek"],
  ])("keeps %s exactly as the backend verified it", async (_, userName) => {
    respond(200, { userName });
    const getUser = await loadGetUser();
    await expect(getUser()).resolves.toBe(userName);
  });

  it.each([
    ["an error status (no Windows credentials)", () => respond(401, { userName: "CORP\\jdoe" })],
    ["a status without a user", () => respond(200, { status: "online", message: "ok" })],
    ["an empty name", () => respond(200, { userName: "  " })],
    ["a network failure", () => vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))],
  ])("gives null for %s, never a guess", async (_, arrange) => {
    arrange();
    const getUser = await loadGetUser();
    await expect(getUser()).resolves.toBeNull();
  });
});
