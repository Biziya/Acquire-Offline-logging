import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_RETRY_MS,
  useUploadDataDraft,
  type DraftSource,
} from "../src/pages/UploadData/useUploadDataDraft";
import * as draftDb from "../src/services/IndexDB/uploadDataDraftDb";

vi.mock("../src/services/IndexDB/uploadDataDraftDb", () => ({
  readUploadDataDraft: vi.fn(),
  writeUploadDataDraft: vi.fn(),
  clearUploadDataDraft: vi.fn(),
}));

const source: DraftSource = {
  fileName: "holes.json",
  fileSize: 10,
  isEdited: false,
  document: { holes: [] },
};

function fireBeforeUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  vi.mocked(draftDb.readUploadDataDraft).mockResolvedValue(null);
  vi.mocked(draftDb.clearUploadDataDraft).mockResolvedValue();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(draftDb.writeUploadDataDraft).mockReset();
});

describe("Upload Data draft retries", () => {
  it("writes a failed draft again on a timer, without another edit", async () => {
    vi.mocked(draftDb.writeUploadDataDraft)
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValue();
    const { result } = renderHook(() => useUploadDataDraft(source, () => true));

    await waitFor(() => expect(result.current.saveFailed).toBe(true));
    expect(fireBeforeUnload()).toBe(true);

    await waitFor(() => expect(result.current.saveFailed).toBe(false), {
      timeout: DRAFT_RETRY_MS + 2000,
    });
    expect(draftDb.writeUploadDataDraft).toHaveBeenCalledTimes(2);
    expect(vi.mocked(draftDb.writeUploadDataDraft).mock.calls[1]?.[0]).toMatchObject(
      { fileName: "holes.json" },
    );
    expect(fireBeforeUnload()).toBe(false);
  });

  it("does not retry a draft that was cleared after the failure", async () => {
    vi.mocked(draftDb.writeUploadDataDraft).mockRejectedValue(new Error("quota"));
    const { result, rerender } = renderHook(
      ({ current }: { current: DraftSource | null }) =>
        useUploadDataDraft(current, () => true),
      { initialProps: { current: source as DraftSource | null } },
    );
    await waitFor(() => expect(result.current.saveFailed).toBe(true));

    rerender({ current: null });
    await new Promise((resolve) => setTimeout(resolve, DRAFT_RETRY_MS + 300));
    expect(draftDb.writeUploadDataDraft).toHaveBeenCalledTimes(1);
    expect(draftDb.clearUploadDataDraft).toHaveBeenCalled();
    expect(fireBeforeUnload()).toBe(false);
  });
});
