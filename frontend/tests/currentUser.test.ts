import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentWindowsUser } from "../src/services/currentUser";
import { useCurrentUser } from "../src/hooks/useCurrentUser";

describe("current user (frontend-owned)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives null without any request while no trusted identity provider exists", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getCurrentWindowsUser()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never calls the removed /api/currentuser endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useCurrentUser());
    await waitFor(() => expect(result.current).toBeNull());

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
