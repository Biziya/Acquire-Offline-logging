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
