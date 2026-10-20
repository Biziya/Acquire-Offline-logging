import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_STORE,
  writeValue,
} from "../src/services/IndexDB/rawLithoDatabase";
import {
  readRawLithoDraft,
  readRawLithoSession,
  writeRawLithoSession,
} from "../src/services/IndexDB/rawLithoDraftDb";
import { normalizeRawLithoDocument } from "../src/pages/RawLitho/rawLithoHelpers";
import { getDrillholes } from "../src/services/Api/drillholeApi";
import { getRawLithoLookup } from "../src/services/Api/rawLithoApi";
import { importUploadData } from "../src/services/Api/uploadData";
import {
  readDrillholeCache,
  saveDrillholes,
} from "../src/services/IndexDB/drillholeCacheDb";
import {
  readLookupCache,
  saveLookupCache,
} from "../src/services/IndexDB/rawLithoLookupCacheDb";
import {
  prepareRawLithoImport,
  applyRawLithoImport,
} from "../src/pages/RawLitho/rawLithoImportService";
import { createBlankDocument } from "../src/pages/RawLitho/rawLithoDocumentOperations";
afterEach(() => vi.unstubAllGlobals());
describe("IndexedDB compatibility", () => {
  it.each(["document", "snapshot", "draft", "value"])(
    "reads legacy %s wrappers from the unchanged database",
    async (wrapper) => {
      const legacy = {
        projectCode: "P",
        holeId: `LEGACY-${wrapper}`,
        rows: [{ id: "existing", lithoFrom: 1 }],
      };
      await writeValue(DRAFT_STORE, legacy.holeId, { [wrapper]: legacy });
      const document = normalizeRawLithoDocument(
        await readRawLithoDraft(legacy.holeId),
      );
      expect(document.rows[0]).toMatchObject({
        id: "existing",
        lithoFrom: "1",
      });
      expect(document.project).toBe("P");
    },
  );
  it("round-trips sessions, drillhole caches and lookup caches", async () => {
    await writeRawLithoSession({ drillhole: "A", page: 3 });
    expect(await readRawLithoSession()).toEqual({ drillhole: "A", page: 3 });
    const holes = [{ holeId: "A", projectCode: "P", campaign: "C" }];
    await saveDrillholes(holes);
    expect((await readDrillholeCache())?.records).toEqual(holes);
    await saveLookupCache("lithoCodes", [{ lithoCode: "Unknown" }]);
    expect((await readLookupCache("lithoCodes"))?.records).toEqual([
      { lithoCode: "Unknown" },
    ]);
  });
  it("validates a JSON import before replacing the target draft", async () => {
    const document = createBlankDocument({ drillhole: "IMPORT" });
    await writeValue(DRAFT_STORE, "IMPORT", document);
    const file = new File([], "import.json");
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(document),
    });
    const plan = await prepareRawLithoImport(file, {});
    expect(plan.willReplaceExistingDraft).toBe(true);
    expect(await applyRawLithoImport(plan)).toMatchObject({
      draftKey: "IMPORT",
    });
    expect(await readRawLithoDraft("IMPORT")).toMatchObject({
      drillhole: "IMPORT",
    });
  });
});
describe("external response validation", () => {
  it("rejects malformed and duplicate drillhole responses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ holeId: 4 }])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            Array(2).fill({ holeId: "A", projectCode: "P", campaign: "C" }),
          ),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(getDrillholes()).rejects.toThrow("invalid response");
    await expect(getDrillholes()).rejects.toThrow("duplicate");
    expect(fetch).toHaveBeenCalledWith("/api/drillholes", {
      signal: undefined,
    });
  });
  it("rejects malformed lookup records and allows a later retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response('[{"lithoCode":3}]'))
        .mockResolvedValueOnce(new Response('[{"lithoCode":"Unknown"}]')),
    );
    await expect(getRawLithoLookup("lithoCode")).rejects.toThrow();
    await expect(getRawLithoLookup("lithoCode")).resolves.toEqual([
      { lithoCode: "Unknown" },
    ]);
  });
  it("keeps the multipart upload endpoint and validates success messages", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"message":"Imported","count":2}'))
      .mockResolvedValueOnce(new Response('{"message":42}'));
    vi.stubGlobal("fetch", fetch);
    const file = new File(["{}"], "data.json", { type: "application/json" });
    expect(await importUploadData(file)).toEqual({
      message: "Imported",
      count: 2,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/uploaddata");
    const body: unknown = fetch.mock.calls[0]?.[1]?.body;
    if (!(body instanceof FormData)) throw new Error("Expected multipart form data.");
    const uploadedFile = body.get("file");
    if (!(uploadedFile instanceof File)) throw new Error("Expected an uploaded file.");
    expect(uploadedFile.name).toBe("data.json");
    await expect(importUploadData(file)).rejects.toThrow(
      "Invalid upload response",
    );
  });
});
