import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import {
  createRawLithoDocument,
  isStandardRawLithoDocument,
  normalizeRawLithoDocument,
  readRawLithoImport,
  touchRawLithoDocument,
} from "../src/pages/RawLitho/rawLithoHelpers";
import { createBlankDocument } from "../src/pages/RawLitho/rawLithoDocumentOperations";
import { createEmptyRow } from "../src/pages/RawLitho/constants";
import {
  readRawLithoDraft,
  writeRawLithoDraft,
} from "../src/services/IndexDB/rawLithoDraftDb";
import { getCurrentWindowsUser } from "../src/services/currentUser";
import type { RawLithoDocument } from "../src/types/domain";

const CREATOR = "CORP\\creator";
const CURRENT = "CORP\\current";

describe("created_by metadata", () => {
  it("is stamped only on a new document and then carried unchanged", () => {
    const created = createBlankDocument({ drillhole: "DH-1", created_by: CREATOR });
    expect(created.created_by).toBe(CREATOR);
    expect(Object.keys(created)).toEqual([
      "project", "campaign", "drillhole", "created_by", "created_at", "modified_at", "rows",
    ]);

    const edited = touchRawLithoDocument(created, { project: "P" });
    expect(edited.created_by).toBe(CREATOR);
    expect(isStandardRawLithoDocument(edited)).toBe(true);
  });

  it("never takes the creator from the fallback, so legacy documents stay without one", () => {
    const legacy = { drillhole: "DH-1", rows: [] };
    const restored = normalizeRawLithoDocument(legacy, {
      fallback: { drillhole: "DH-1", created_by: CURRENT },
    });
    expect("created_by" in restored).toBe(false);
    expect(JSON.parse(JSON.stringify(restored))).not.toHaveProperty("created_by");
  });

  it("is preserved by JSON import and rejected when it is not text", async () => {
    const document = createRawLithoDocument({ drillhole: "DH-1", created_by: CREATOR });
    const file = (value: unknown) =>
      new File([JSON.stringify(value)], "dh.json", { type: "application/json" });

    expect((await readRawLithoImport(file(document))).created_by).toBe(CREATOR);

    const legacy = createRawLithoDocument({ drillhole: "DH-1" });
    expect(await readRawLithoImport(file(legacy))).not.toHaveProperty("created_by");

    await expect(readRawLithoImport(file({ ...document, created_by: 42 }))).rejects.toThrow(
      "created_by value must be text",
    );
  });

  it("gives no identity while no trusted identity provider exists", async () => {
    await expect(getCurrentWindowsUser()).resolves.toBeNull();
  });
});

async function openDrillhole(holeId: string, currentUser: string | null) {
  const hook = renderHook(() =>
    useRawLithoWorkspace({
      drillholes: [{ holeId, projectCode: "P", campaign: "C" }],
      showToast: () => {},
      currentUser,
    }),
  );
  act(() => hook.result.current.selectDrillhole(holeId));
  await waitFor(() => expect(hook.result.current.isPageEnabled).toBe(true));
  return hook;
}

describe("Raw Litho workspace creator", () => {
  it("stamps the current user on a new drillhole and keeps it through autosave", async () => {
    const { result } = await openDrillhole("NEW-HOLE", CURRENT);
    expect(result.current.rawLithoDocument.created_by).toBe(CURRENT);

    act(() => result.current.updateRow(result.current.rows[0]?.id ?? 1, "lithoFrom", "5"));
    await act(() => result.current.flushPendingSaves());
    const stored = (await readRawLithoDraft("NEW-HOLE")) as RawLithoDocument | null;
    expect(stored?.created_by).toBe(CURRENT);
  });

  it("keeps the original creator, and gives a legacy draft none, when someone else opens it", async () => {
    await writeRawLithoDraft(
      "OLD-HOLE",
      createRawLithoDocument({ drillhole: "OLD-HOLE", created_by: CREATOR, rows: [createEmptyRow(1)] }),
    );
    const owned = await openDrillhole("OLD-HOLE", CURRENT);
    expect(owned.result.current.rawLithoDocument.created_by).toBe(CREATOR);
    owned.unmount();

    await writeRawLithoDraft(
      "LEGACY-HOLE",
      createRawLithoDocument({ drillhole: "LEGACY-HOLE", rows: [createEmptyRow(1)] }),
    );
    const legacy = await openDrillhole("LEGACY-HOLE", CURRENT);
    expect(legacy.result.current.rawLithoDocument).not.toHaveProperty("created_by");
  });

  it("stamps a new document whose identity arrives late, at its first save — never a legacy one", async () => {
    const open = (holeId: string) =>
      renderHook(
        ({ currentUser }: { currentUser: string | null }) =>
          useRawLithoWorkspace({
            drillholes: [{ holeId, projectCode: "P", campaign: "C" }],
            showToast: () => {},
            currentUser,
          }),
        { initialProps: { currentUser: null as string | null } },
      );

    // New drillhole, created while the identity is still unknown.
    const late = open("LATE-HOLE");
    act(() => late.result.current.selectDrillhole("LATE-HOLE"));
    await waitFor(() => expect(late.result.current.isPageEnabled).toBe(true));
    expect(late.result.current.rawLithoDocument).not.toHaveProperty("created_by");

    late.rerender({ currentUser: CURRENT });
    act(() => late.result.current.updateRow(late.result.current.rows[0]?.id ?? 1, "lithoFrom", "1"));
    expect(late.result.current.rawLithoDocument.created_by).toBe(CURRENT);
    await act(() => late.result.current.flushPendingSaves());
    expect(((await readRawLithoDraft("LATE-HOLE")) as RawLithoDocument | null)?.created_by).toBe(CURRENT);
    late.unmount();

    // A stored legacy draft stays without a creator after the identity arrives.
    await writeRawLithoDraft(
      "LEGACY-LATE",
      createRawLithoDocument({ drillhole: "LEGACY-LATE", rows: [createEmptyRow(1)] }),
    );
    const legacy = open("LEGACY-LATE");
    act(() => legacy.result.current.selectDrillhole("LEGACY-LATE"));
    await waitFor(() => expect(legacy.result.current.isPageEnabled).toBe(true));
    legacy.rerender({ currentUser: CURRENT });
    act(() => legacy.result.current.updateRow(legacy.result.current.rows[0]?.id ?? 1, "lithoFrom", "1"));
    await act(() => legacy.result.current.flushPendingSaves());
    expect(await readRawLithoDraft("LEGACY-LATE")).not.toHaveProperty("created_by");
  });

  it("leaves created_by unset when no identity is available", async () => {
    const { result } = await openDrillhole("ANON-HOLE", null);
    expect(result.current.rawLithoDocument).not.toHaveProperty("created_by");
  });
});
