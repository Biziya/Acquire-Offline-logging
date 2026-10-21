import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The endpoint is read when the module loads, so each case loads a fresh copy.
async function loadWithEndpoint(path: string) {
  vi.resetModules();
  vi.stubEnv("VITE_CURRENT_USER_PATH", path);
  return (await import("../src/services/currentUser")).getCurrentWindowsUser;
}

function respond(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("current Windows user", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("makes no request and gives null while no endpoint is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const getUser = await loadWithEndpoint("");
    await expect(getUser()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads the trusted name from the configured endpoint, once", async () => {
    const fetchSpy = respond(200, { userName: " CORP\\jdoe " });
    const getUser = await loadWithEndpoint("/api/currentuser");
    await expect(getUser()).resolves.toBe("CORP\\jdoe");
    await expect(getUser()).resolves.toBe("CORP\\jdoe");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/currentuser");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("asks again after a failed lookup, then keeps the verified name", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("backend not started"))
      .mockResolvedValue(new Response(JSON.stringify({ userName: "Bek" })));
    const getUser = await loadWithEndpoint("/api/currentuser");

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
    vi.stubEnv("VITE_CURRENT_USER_PATH", "/api/currentuser");
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
    const getUser = await loadWithEndpoint("/api/currentuser");
    await expect(getUser()).resolves.toBe(userName);
  });

  it.each([
    ["an error status", () => respond(401, { userName: "CORP\\jdoe" })],
    ["a malformed body", () => respond(200, { name: "CORP\\jdoe" })],
    ["an empty name", () => respond(200, { userName: "  " })],
    ["a network failure", () => vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))],
  ])("gives null for %s, never a guess", async (_, arrange) => {
    arrange();
    const getUser = await loadWithEndpoint("/api/currentuser");
    await expect(getUser()).resolves.toBeNull();
  });
});
