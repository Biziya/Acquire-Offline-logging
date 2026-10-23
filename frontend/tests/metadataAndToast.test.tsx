import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import uiText from "../src/config/ui.yaml?raw";
import { readUiConfig, uiConfig } from "../src/config/uiConfig";
import Toast from "../src/components/Toast";
import Sidebar from "../src/components/Sidebar";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import {
  createRawLithoDocument,
  isStandardRawLithoDocument,
  normalizeRawLithoDocument,
  readRawLithoImport,
} from "../src/pages/RawLitho/rawLithoHelpers";
import { createEmptyRow } from "../src/pages/RawLitho/constants";
import {
  readRawLithoDraft,
  writeRawLithoDraft,
} from "../src/services/IndexDB/rawLithoDraftDb";
import { getCurrentWindowsUser } from "../src/services/currentUser";
import type { RawLithoDocument } from "../src/types/domain";

vi.mock("../src/services/currentUser", () => ({
  getCurrentWindowsUser: vi.fn(async () => null),
}));
vi.mock("../src/services/Api/backendStatus", () => ({
  getBackendStatus: vi.fn(async () => ({ status: "online" })),
}));

const CREATOR = "CORP\\creator";
const EDITOR = "CORP\\editor";
const CURRENT = "CORP\\current";

const jsonFile = (value: unknown) =>
  new File([JSON.stringify(value)], "dh.json", { type: "application/json" });

describe("edited_by metadata", () => {
  it("survives normalisation and JSON import, and is rejected when not text", async () => {
    const document = {
      ...createRawLithoDocument({ drillhole: "DH-1", created_by: CREATOR }),
      edited_by: EDITOR,
    };
    const normalized = normalizeRawLithoDocument(document);
    expect(normalized.edited_by).toBe(EDITOR);
    expect(normalized.created_by).toBe(CREATOR);
    expect(isStandardRawLithoDocument(normalized)).toBe(true);
    expect(normalized).not.toHaveProperty("imported_by");

    const imported = await readRawLithoImport(jsonFile(document));
    expect(imported.edited_by).toBe(EDITOR);
    expect(imported.created_by).toBe(CREATOR);

    await expect(
      readRawLithoImport(jsonFile({ ...document, edited_by: 7 })),
    ).rejects.toThrow("edited_by value must be text");
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

  it("is not changed by loading a draft, is stamped by an edit and autosaved", async () => {
    await writeRawLithoDraft("EDIT-HOLE", {
      ...createRawLithoDocument({
        drillhole: "EDIT-HOLE",
        created_by: CREATOR,
        rows: [createEmptyRow(1)],
      }),
      edited_by: EDITOR,
    });
    const { result } = await openDrillhole("EDIT-HOLE", CURRENT);
    expect(result.current.rawLithoDocument.edited_by).toBe(EDITOR);

    act(() => result.current.updateRow(1, "lithoFrom", "3"));
    expect(result.current.rawLithoDocument.edited_by).toBe(CURRENT);
    expect(result.current.rawLithoDocument.created_by).toBe(CREATOR);
    await act(() => result.current.flushPendingSaves());
    const stored = (await readRawLithoDraft("EDIT-HOLE")) as RawLithoDocument | null;
    expect(stored?.edited_by).toBe(CURRENT);
    expect(stored?.created_by).toBe(CREATOR);
    expect(stored).not.toHaveProperty("imported_by");
  });

  it("keeps the previous editor when no trusted identity is available", async () => {
    await writeRawLithoDraft("ANON-EDIT", {
      ...createRawLithoDocument({ drillhole: "ANON-EDIT", rows: [createEmptyRow(1)] }),
      edited_by: EDITOR,
    });
    const { result } = await openDrillhole("ANON-EDIT", null);
    act(() => result.current.updateRow(1, "lithoFrom", "3"));
    expect(result.current.rawLithoDocument.edited_by).toBe(EDITOR);
  });
});

describe("global toast configuration", () => {
  afterEach(() => vi.useRealTimers());

  it("reads the shipped durations from config/ui.yaml and rejects bad values", () => {
    expect(uiConfig.toastDuration).toMatchObject({
      error: 5000,
      warning: 3000,
      success: 3000,
    });
    expect(() =>
      readUiConfig(uiText.replace("error: 5000", "error: fast")),
    ).toThrow(/toast\.duration\.error must be a whole number/);
  });

  it.each([
    ["error", 5000],
    ["warning", 3000],
    ["success", 3000],
  ] as const)("closes a %s toast after %i ms", (type, duration) => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="Message" type={type} isVisible onClose={onClose} />);

    act(() => vi.advanceTimersByTime(duration - 1));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restarts the timer when the same notification is shown again", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const view = render(
      <Toast key={1} message="Row added" type="success" isVisible onClose={onClose} />,
    );
    act(() => vi.advanceTimersByTime(2000));
    view.rerender(
      <Toast key={2} message="Row added" type="success" isVisible onClose={onClose} />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("sidebar user", () => {
  const renderSidebar = () =>
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

  it("shows the trusted domain user above the divider and the status", async () => {
    vi.mocked(getCurrentWindowsUser).mockResolvedValueOnce("CORP\\jdoe");
    const { container } = renderSidebar();
    const user = await screen.findByText("CORP\\jdoe");
    const divider = container.querySelector("hr");
    const status = await screen.findByRole("status");

    expect(divider).not.toBeNull();
    expect(user.compareDocumentPosition(divider as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(divider?.compareDocumentPosition(status)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await waitFor(() => expect(status).toHaveTextContent("Online"));
  });

  it("shows a local account name without a domain", async () => {
    vi.mocked(getCurrentWindowsUser).mockResolvedValueOnce("Bek");
    renderSidebar();
    expect(await screen.findByText("Bek")).toHaveAttribute("title", "Bek");
  });

  it("shows a neutral label, never a guessed name, without an identity", async () => {
    renderSidebar();
    expect(await screen.findByText("User not identified")).toBeInTheDocument();
  });
});
