import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { uiConfig } from "../src/config/uiConfig";

// The pages themselves are tested elsewhere; here only which one opens.
vi.mock("../src/pages/RawLitho/RawLitho", () => ({ default: () => <h1>Raw Litho page</h1> }));
vi.mock("../src/pages/DatabaseViewer/DatabaseViewer", () => ({ default: () => <h1>Database Viewer page</h1> }));
vi.mock("../src/pages/UploadData/UploadData", () => ({ default: () => <h1>Upload Data page</h1> }));
vi.mock("../src/components/StatusIndicator", () => ({ default: () => null }));
vi.mock("../src/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("Application navigation", () => {
  it("is branded AcQuire WEB and lists the three pages without Home", () => {
    renderAt("/raw-litho");

    expect(uiConfig.appName).toBe("AcQuire WEB");
    expect(screen.getByText("AcQuire WEB")).toBeInTheDocument();
    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Raw Litho", "Database Viewer", "Upload Data"]);
    expect(screen.getByRole("link", { name: "Raw Litho" })).toHaveClass("bg-[#1f2937]");
  });

  it.each(["/", "/unknown"])("opens Raw Litho at %s instead of a blank page", (path) => {
    renderAt(path);

    expect(screen.getByRole("heading", { name: "Raw Litho page" })).toBeInTheDocument();
  });

  it("keeps the other routes", () => {
    renderAt("/database-viewer");
    expect(screen.getByRole("heading", { name: "Database Viewer page" })).toBeInTheDocument();
  });
});
