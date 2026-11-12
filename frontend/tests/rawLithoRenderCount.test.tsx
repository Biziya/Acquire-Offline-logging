import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RawLithoTable from "../src/pages/RawLitho/RawLithoTable";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import { createSchemaRow } from "../src/types/rawLithoSchema";
import { createRawLithoDocument } from "../src/pages/RawLitho/rawLithoHelpers";
import { writeRawLithoDraft } from "../src/services/IndexDB/rawLithoDraftDb";
import type * as Validation from "../src/pages/RawLitho/rawLithoValidation";

/*
 * RawLithoRow evaluates its conditional rules once per render, so counting
 * those calls counts row renders without instrumenting the component.
 */
const ruleChecks = vi.hoisted(() => ({ count: 0 }));
vi.mock("../src/pages/RawLitho/rawLithoValidation", async (importOriginal) => {
  const actual = await importOriginal<typeof Validation>();
  return {
    ...actual,
    findConditionalRuleIssues: (...args: Parameters<typeof actual.findConditionalRuleIssues>) => {
      ruleChecks.count += 1;
      return actual.findConditionalRuleIssues(...args);
    },
  };
});

const HOLE = "RENDERS";
const showToast = vi.fn();
// Module constants, like the state the real page passes: stable identities.
const NO_LOOKUPS = {};
const NO_STATUS = {};

function Harness() {
  const workspace = useRawLithoWorkspace({
    drillholes: [{ holeId: HOLE, projectCode: "P", campaign: "C" }],
    showToast,
  });
  return (
    <>
      <button onClick={() => workspace.selectDrillhole(HOLE)}>Select</button>
      <RawLithoTable
        rows={workspace.rows}
        currentPage={workspace.currentPage}
        totalPages={workspace.totalPages}
        onPageChange={workspace.changeTablePage}
        lookupData={NO_LOOKUPS}
        lookupStatus={NO_STATUS}
        onRowChange={workspace.updateRow}
        onDepthCommit={workspace.commitDepthEdit}
        onPasteCells={workspace.pasteCells}
        showToast={showToast}
        onAddRow={workspace.tryAddRow}
        onRemoveLastRow={() => {}}
        isEnabled={workspace.isPageEnabled}
        isBlocked={false}
      />
    </>
  );
}

describe("Raw Litho editing render cost", () => {
  it("re-renders only the edited row when one cell changes on a full page", async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      ...createSchemaRow(`r${index}`),
      lithoFrom: String(index),
      lithoTo: String(index + 1),
    }));
    await writeRawLithoDraft(HOLE, createRawLithoDocument({ drillhole: HOLE, rows }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Select" }));
    await waitFor(() => expect(screen.getByLabelText("Lithology Comments, row 50")).toBeEnabled());
    const comments = screen.getByLabelText("Lithology Comments, row 1");
    await user.click(comments);

    ruleChecks.count = 0;
    await user.keyboard("a");
    expect(comments).toHaveValue("a");
    // Before memoization and identity-preserving normalization: all 50 rows.
    expect(ruleChecks.count).toBe(1);
  });
});
