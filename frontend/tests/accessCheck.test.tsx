import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteValue, SESSION_STORE } from "../src/services/IndexDB/rawLithoDatabase";

// The pages themselves are tested elsewhere; here only whether the app opens.
vi.mock("../src/pages/RawLitho/RawLitho", () => ({ default: () => <h1>Raw Litho page</h1> }));
vi.mock("../src/pages/DatabaseViewer/DatabaseViewer", () => ({ default: () => <h1>Database Viewer page</h1> }));
vi.mock("../src/pages/UploadData/UploadData", () => ({ default: () => <h1>Upload Data page</h1> }));
vi.mock("../src/components/StatusIndicator", () => ({ default: () => null }));
vi.mock("../src/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));
vi.mock("../src/hooks/useCachedWindowsIdentity", () => ({ useCachedWindowsIdentity: () => null }));

// currentUser.ts keeps the shared request in module state: load fresh copies.
async function loadApp() {
  vi.resetModules();
  return (await import("../src/App")).default;
}

async function loadCheck() {
  vi.resetModules();
  return (await import("../src/services/websiteAccess")).checkWebsiteAccess;
}

function respond(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(body), { status }),
  );
}

async function renderApp() {
  const App = await loadApp();
  return render(
    <MemoryRouter initialEntries={["/raw-litho"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("website access by AD group", () => {
  beforeEach(async () => {
    await deleteValue(SESSION_STORE, "website-access");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the app for a member of the allowed group", async () => {
    respond(200, { status: "online", userName: "BDOM\\jdoe", isAuthorized: true });

    await renderApp();

    expect(await screen.findByRole("heading", { name: "Raw Litho page" })).toBeInTheDocument();
  });

  it("shows Access denied, with the account, to a user outside the group", async () => {
    respond(200, { status: "online", userName: "BDOM\\other", isAuthorized: false });

    await renderApp();

    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
    expect(screen.getByText("BDOM\\other")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Raw Litho page" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("treats a backend without the group check (no isAuthorized) as allowed", async () => {
    respond(200, { status: "online", userName: "BDOM\\jdoe" });

    const check = await loadCheck();

    await expect(check()).resolves.toEqual({ status: "allowed", userName: "BDOM\\jdoe", source: "backend" });
  });

  it("uses the last backend answer while the backend cannot be reached", async () => {
    const fetchSpy = respond(200, { userName: "BDOM\\other", isAuthorized: false });
    await (await loadCheck())();

    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await loadCheck();

    await expect(offline()).resolves.toEqual({ status: "denied", userName: "BDOM\\other", source: "cache" });
  });

  it("asks a never-verified user to check again when the backend is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await renderApp();

    expect(await screen.findByRole("heading", { name: "Can't verify your Windows account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });
});
