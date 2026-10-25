import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Drillhole, RawLithoDocument } from "../src/types/domain";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import { useWorkingDrillholes } from "../src/pages/RawLitho/hooks/useWorkingDrillholes";
import RawLithoFilters from "../src/pages/RawLitho/RawLithoFilters";
import { createEmptyRow } from "../src/pages/RawLitho/constants";
import { createBlankDocument } from "../src/pages/RawLitho/rawLithoDocumentOperations";
import {
  readRawLithoDraft,
  writeRawLithoDraft,
} from "../src/services/IndexDB/rawLithoDraftDb";

function renderWorkspace(initial: Drillhole[]) {
  return renderHook(
    ({ drillholes }: { drillholes: Drillhole[] }) =>
      useRawLithoWorkspace({ drillholes, showToast: () => {} }),
    { initialProps: { drillholes: initial } },
  );
}

const document = (hook: ReturnType<typeof renderWorkspace>) =>
  hook.result.current.rawLithoDocument;

describe("Raw Litho drillhole, Project and Campaign stay together", () => {
  it("fills Project and Campaign when the drillhole list arrives after the selection", async () => {
    // Returning to the page: the selection is restored before the list loads.
    const hook = renderWorkspace([]);
    act(() => hook.result.current.selectDrillhole("RETURN-HOLE"));
    await waitFor(() => expect(hook.result.current.isPageEnabled).toBe(true));
    expect(document(hook)).toMatchObject({ drillhole: "RETURN-HOLE", project: "", campaign: "" });

    hook.rerender({
      drillholes: [{ holeId: "RETURN-HOLE", projectCode: "ZOOVCH", campaign: "2015" }],
    });

    await waitFor(() =>
      expect(document(hook)).toMatchObject({
        drillhole: "RETURN-HOLE",
        project: "ZOOVCH",
        campaign: "2015",
      }),
    );
  });

  it("never takes another drillhole's values, and keeps a document's own values", async () => {
    const hook = renderWorkspace([]);
    act(() => hook.result.current.selectDrillhole("FIRST-HOLE"));
    act(() => hook.result.current.selectDrillhole("SECOND-HOLE"));
    await waitFor(() => expect(document(hook).drillhole).toBe("SECOND-HOLE"));

    hook.rerender({
      drillholes: [
        { holeId: "FIRST-HOLE", projectCode: "OLD", campaign: "2014" },
        { holeId: "SECOND-HOLE", projectCode: "ZOOVCH", campaign: "2016" },
      ],
    });
    await waitFor(() => expect(document(hook).project).toBe("ZOOVCH"));
    expect(document(hook).campaign).toBe("2016");

    // A list entry that differs later does not overwrite values already set.
    hook.rerender({
      drillholes: [{ holeId: "SECOND-HOLE", projectCode: "CHANGED", campaign: "1999" }],
    });
    expect(document(hook)).toMatchObject({ project: "ZOOVCH", campaign: "2016" });
  });
});

describe("Recent Working Drillholes", () => {
  const holes = ["DH001", "DH002", "DH003", "DH004", "DH005"].map((holeId) => ({
    holeId,
    projectCode: "P",
    campaign: "2026",
  }));

  it("lists the working drillholes first, then every other drillhole, each once", async () => {
    const user = userEvent.setup();
    const onDrillholeChange = vi.fn();
    render(
      <RawLithoFilters
        drillholes={holes}
        recentCount={2}
        selectedHoleId=""
        selectedDrillhole={null}
        isLoading={false}
        error=""
        onDrillholeChange={onDrillholeChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Drillhole" });
    await user.click(input);

    const listbox = screen.getByRole("listbox");
    expect(Array.from(listbox.children).map((item) => item.textContent)).toEqual([
      "Recent Working Drillholes",
      "DH001",
      "DH002",
      "All Drillholes",
      "DH003",
      "DH004",
      "DH005",
    ]);
    expect(screen.getAllByRole("option")).toHaveLength(5);

    // Headings are skipped by the keyboard: the third option is DH003.
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onDrillholeChange).toHaveBeenCalledWith("DH003");
  });

  it("searches every drillhole as one ranked list", async () => {
    const user = userEvent.setup();
    render(
      <RawLithoFilters
        drillholes={holes}
        recentCount={2}
        selectedHoleId=""
        selectedDrillhole={null}
        isLoading={false}
        error=""
        onDrillholeChange={() => {}}
      />,
    );

    await user.type(screen.getByRole("combobox", { name: "Drillhole" }), "DH00");

    expect(screen.queryByText("Recent Working Drillholes")).toBeNull();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "DH001",
      "DH002",
      "DH003",
      "DH004",
      "DH005",
    ]);
  });

  it("knows the drillholes with saved data, and follows the open document", async () => {
    const blank = createBlankDocument({ drillhole: "BLANK" });
    const worked = (holeId: string) => ({
      ...createBlankDocument({ drillhole: holeId }),
      rows: [{ ...createEmptyRow(1), lithoCode: "SS" }],
    });
    await writeRawLithoDraft("BLANK", blank);
    await writeRawLithoDraft("SAVED", worked("SAVED"));

    const hook = renderHook(
      ({ lithoDocument, isLoaded }: { lithoDocument: RawLithoDocument; isLoaded: boolean }) =>
        useWorkingDrillholes(lithoDocument, isLoaded),
      { initialProps: { lithoDocument: blank, isLoaded: false } },
    );

    await waitFor(() => expect([...hook.result.current.keys()]).toEqual(["SAVED"]));

    // A new drillhole joins once its open document holds data…
    hook.rerender({ lithoDocument: worked("NEW"), isLoaded: true });
    await waitFor(() => expect(hook.result.current.has("NEW")).toBe(true));

    // …and leaves if every value is cleared. Stored drafts are not touched.
    hook.rerender({ lithoDocument: createBlankDocument({ drillhole: "NEW" }), isLoaded: true });
    await waitFor(() => expect(hook.result.current.has("NEW")).toBe(false));
    expect(await readRawLithoDraft("BLANK")).toEqual(blank);
  });
});
