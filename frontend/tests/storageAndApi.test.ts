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
        .mockResolvedValueOnce(new Response('{"lithoCode":[{"lithoCode":3}]}'))
        .mockResolvedValueOnce(new Response('{"lithoCode":[{"lithoCode":"Unknown"}]}')),
    );
    await expect(getRawLithoLookup("lithoCode")).rejects.toThrow();
    await expect(getRawLithoLookup("lithoCode")).resolves.toEqual([
      { lithoCode: "Unknown" },
    ]);
  });

  it("loads all nine lookups with one /api/table-constants request", async () => {
    const constants = {
      lithoCode: [{ lithoCode: "0--", description: "Unknown" }],
      colourCode: [{ colourCode: "10G4/2", description: "Greenish grey" }],
      caCode: [{ caCode: "1", description: null }],
      omCode: [{ omCode: "2", description: "OM" }],
      omFaciesCode: [{ omFaciesCode: "A", description: "Facies A" }],
      pyCode: [{ pyCode: "N", description: "No" }],
      oxCode: [{ oxCode: "Y", description: "Yes" }],
      sedimCode: [{ sedimCode: "LAM", description: "Laminated" }],
      redoxCode: [{ redoxCode: "0042_MN1", description: "Reduced" }],
    };
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => Response.json(constants));
    vi.stubGlobal("fetch", fetch);
    // A fresh module: the shared request must not come from an earlier test.
    vi.resetModules();
    const api = await import("../src/services/Api/rawLithoApi");

    const fields = ["lithoCode", "colorCode", "ca", "om", "omFacies", "py", "ox", "sedim", "redoxCode"] as const;
    const lists = await Promise.all(fields.map((field) => api.getRawLithoLookup(field)));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/table-constants");
    expect(lists).toEqual([
      constants.lithoCode, constants.colourCode, constants.caCode, constants.omCode,
      constants.omFaciesCode, constants.pyCode, constants.oxCode, constants.sedimCode,
      constants.redoxCode,
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
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/upload-data");
    expect(fetch.mock.calls[0]?.[1]?.credentials).toBe("include");
    const body: unknown = fetch.mock.calls[0]?.[1]?.body;
    if (!(body instanceof FormData)) throw new Error("Expected multipart form data.");
    const uploadedFile = body.get("file");
    if (!(uploadedFile instanceof File)) throw new Error("Expected an uploaded file.");
    expect(uploadedFile.name).toBe("data.json");
    await expect(importUploadData(file)).rejects.toThrow(
      "Invalid upload response",
    );
  });

  it("reports the backend message and first row error, never a raw error page", async () => {
    const file = new File(["{}"], "data.json", { type: "application/json" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              success: false,
              message: "Invalid lithology data.",
              errors: ["Row 3: lithoFrom must be less than lithoTo.", "Row 4: lithoTo is required."],
            },
            { status: 400 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({ success: false, message: "Database upload failed." }, { status: 500 }),
        )
        .mockResolvedValueOnce(
          new Response("System.Exception: Login failed for user 'sa'\n   at ...", { status: 500 }),
        ),
    );

    await expect(importUploadData(file)).rejects.toThrow(
      "Invalid lithology data. Row 3: lithoFrom must be less than lithoTo. (and other errors)",
    );
    await expect(importUploadData(file)).rejects.toThrow("Database upload failed.");
    await expect(importUploadData(file)).rejects.toThrow(/^Upload failed$/);
  });

  it("reports a missing Windows sign-in and a user SQL Server did not authorize", async () => {
    const file = new File(["{}"], "data.json", { type: "application/json" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(
          Response.json(
            {
              success: false,
              message: "BDOM\\jsmith is not authorized to upload data. Contact the database administrator.",
            },
            { status: 403 },
          ),
        ),
    );

    await expect(importUploadData(file)).rejects.toThrow(
      "Windows sign-in required: your account could not be verified.",
    );
    await expect(importUploadData(file)).rejects.toThrow(
      "BDOM\\jsmith is not authorized to upload data. Contact the database administrator.",
    );
  });

  it("reports a request that runs past the timeout", async () => {
    const file = new File(["{}"], "data.json", { type: "application/json" });
    // A timeout signal that has already fired, as after 180 s.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() =>
      AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError")),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => Promise.reject(init.signal?.reason)),
    );

    try {
      await expect(importUploadData(file)).rejects.toThrow("Upload timed out");
      // A user Cancel is still an abort, not a timeout.
      timeout.mockRestore();
      const cancelled = Object.assign(new Error("Cancelled"), { name: "AbortError" });
      await expect(importUploadData(file, AbortSignal.abort(cancelled))).rejects.toBe(
        cancelled,
      );
    } finally {
      timeout.mockRestore();
    }
  });
});
