import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Drillhole } from "../src/types/domain";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";

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
