import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RawLithoRow } from "../src/types/domain";
import RawLithoTable from "../src/pages/RawLitho/RawLithoTable";
import { useRawLithoWorkspace } from "../src/pages/RawLitho/hooks/useRawLithoWorkspace";
import { createEmptyRow } from "../src/pages/RawLitho/constants";
import { createRawLithoDocument } from "../src/pages/RawLitho/rawLithoHelpers";
import {
  CONDITIONAL_RULE_MESSAGES as MESSAGES,
  findConditionalRuleIssues,
  findFirstConditionalRuleIssue,
  hasValue,
} from "../src/pages/RawLitho/rawLithoValidation";
import { validateUploadDocument } from "../src/pages/UploadData/uploadDataValidation";
import { writeRawLithoDraft } from "../src/services/IndexDB/rawLithoDraftDb";

const issues = (row: Partial<RawLithoRow>) => findConditionalRuleIssues(row);

describe("hasValue", () => {
  it.each([
    ["0", true],
    [0, true],
    ["A", true],
    ["", false],
    ["   ", false],
    [null, false],
    [undefined, false],
  ])("%j → %s", (value, expected) => {
    expect(hasValue(value)).toBe(expected);
  });
});

describe("conditional Raw Litho rules", () => {
  it.each<[string, Partial<RawLithoRow>, string[]]>([
    ["OM = 0, OM Facies empty", { om: "0" }, [MESSAGES.omFaciesRequired]],
    ["OM empty, Litho 01M, OM Facies empty", { lithoCode: "01M" }, [MESSAGES.omFaciesRequired]],
    ["Litho 24M, OM Facies filled", { lithoCode: "24M", omFacies: "A" }, []],
    ["Litho L--, OM Facies whitespace", { lithoCode: "L--", omFacies: "  " }, [MESSAGES.omFaciesRequired]],
    ["Litho 0-C, CA empty", { lithoCode: "0-C" }, [MESSAGES.caRequired]],
    ["Litho 26C, CA filled", { lithoCode: "26C", ca: "1" }, []],
    ["Redox O, OX empty", { redoxCode: "O" }, [MESSAGES.oxRequired]],
    ["Redox lGrB, OX filled", { redoxCode: "lGrB", ox: "2" }, []],
    ["Redox Bl, OX filled", { redoxCode: "Bl", ox: "2" }, [MESSAGES.oxMustBeEmpty]],
    ["Redox Bl, OX = 0", { redoxCode: "Bl", ox: "0" }, [MESSAGES.oxMustBeEmpty]],
    ["Redox GnGr, OX empty", { redoxCode: "GnGr" }, []],
    ["codes are case-sensitive (ly is not lY)", { redoxCode: "ly" }, []],
    ["surrounding spaces are ignored", { lithoCode: " 0-C " }, [MESSAGES.caRequired]],
    ["unrelated codes", { lithoCode: "SS", redoxCode: "OX" }, []],
  ])("%s", (_, row, expected) => {
    expect(issues(row).map((issue) => issue.message)).toEqual(expected);
  });

  it("marks the cell that has to change", () => {
    expect(issues({ om: "1", lithoCode: "0-C", redoxCode: "Y" }).map((issue) => issue.field)).toEqual([
      "omFacies",
      "ca",
      "ox",
    ]);
  });

  it("re-evaluates when a controlling field changes: Redox O → Bl with OX kept", () => {
    const row = { redoxCode: "O", ox: "2" };
    expect(issues(row)).toEqual([]);
    expect(issues({ ...row, redoxCode: "Bl" }).map((issue) => issue.message)).toEqual([
      MESSAGES.oxMustBeEmpty,
    ]);
  });

  it("finds the first broken rule in table order for the Save warning", () => {
    const rows = [
      { ...createEmptyRow("a"), lithoCode: "SS" },
      { ...createEmptyRow("b"), lithoCode: "26C" },
    ];
    expect(findFirstConditionalRuleIssue(rows)).toEqual({
      rowIndex: 1,
      field: "ca",
      message: MESSAGES.caRequired,
    });
    expect(findFirstConditionalRuleIssue([rows[0]!])).toBeNull();
  });

  it("blocks the Upload Data upload with the same rules", () => {
    const row = (overrides: Partial<RawLithoRow>) => ({
      ...createEmptyRow("1"),
      id: 1,
      lithoFrom: "0",
      lithoTo: "5",
      ...overrides,
    });
    const document = { project: "P", campaign: "C", drillhole: "DH", rows: [row({ redoxCode: "O" })] };
    const unchecked = { records: {}, state: {} };

    const invalid = validateUploadDocument(document, unchecked);
    expect(invalid.hasBlockingErrors).toBe(true);
    expect(invalid.rowIssues[0]).toContainEqual({
      severity: "error",
      field: "ox",
      message: MESSAGES.oxRequired,
    });

    const fixed = validateUploadDocument({ ...document, rows: [row({ redoxCode: "O", ox: "2" })] }, unchecked);
    expect(fixed.rowIssues[0]?.some((issue) => issue.field === "ox")).toBeFalsy();
  });
});

/* ---------------------------------------------------------------------------
 * The real Raw Litho table and workspace: every way of entering data.
 * ------------------------------------------------------------------------- */

const HOLE = "RULES";
const showToast = vi.fn();
const lookupData = {
  lithoCode: ["SS", "01M", "0-C", "26C"].map((lithoCode) => ({ lithoCode })),
  colorCode: [{ colourCode: "RED" }],
  ca: [{ caCode: "1" }],
  om: [{ omCode: "0" }],
  omFacies: [{ omFaciesCode: "A" }],
  ox: [{ oxCode: "2" }],
  sedim: [{ sedimCode: "LAM" }],
  redoxCode: ["OX", "O", "Bl", "lGrB"].map((redoxCode) => ({ redoxCode })),
};

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
        lookupData={lookupData}
        lookupStatus={{}}
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

function storedRow(id: string, from: number, to: number, overrides: Partial<RawLithoRow> = {}) {
  return {
    ...createEmptyRow(id),
    lithoFrom: String(from),
    lithoTo: String(to),
    lithoCode: "SS",
    colorCode: "RED",
    redoxCode: "OX",
    ...overrides,
  };
}

async function openTable(rows: RawLithoRow[]) {
  showToast.mockClear();
  await writeRawLithoDraft(HOLE, createRawLithoDocument({ drillhole: HOLE, rows }));
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Select" }));
  await waitFor(() => expect(screen.getByLabelText("OX, row 1")).toBeEnabled());
  return user;
}

const cell = (label: string) => screen.getByLabelText(label);
const cellOf = (label: string) => cell(label).closest("td") as HTMLElement;
// Ctrl + click adds a cell to the selection; a plain click elsewhere clears it.
const select = (label: string) => fireEvent.mouseDown(cell(label), { ctrlKey: true });
const clearSelection = () => fireEvent.mouseDown(document.body);
const paste = (label: string, text: string) =>
  fireEvent.paste(cell(label), { clipboardData: { getData: () => text } });

function expectRuleError(label: string, message: string) {
  expect(cellOf(label)).toHaveClass("raw-litho-cell--rule");
  expect(cellOf(label)).toHaveAttribute("title", message);
}

function expectNoRuleError(label: string) {
  expect(cellOf(label)).not.toHaveClass("raw-litho-cell--rule");
  expect(cellOf(label)).not.toHaveAttribute("title");
}

describe("conditional rules in the Raw Litho table", () => {
  it("marks a dependent cell when a controlling value is pasted, and clears it once fixed", async () => {
    await openTable([storedRow("r1", 0, 10)]);
    expectNoRuleError("OM Facies, row 1");

    select("Litho Code, row 1");
    paste("Litho Code, row 1", "01M");
    clearSelection();
    expectRuleError("OM Facies, row 1", MESSAGES.omFaciesRequired);

    select("OM Facies, row 1");
    paste("OM Facies, row 1", "A");
    clearSelection();
    expectNoRuleError("OM Facies, row 1");
    expect(cell("OM Facies, row 1")).toHaveValue("A");
  });

  it("revalidates OX when Redox changes from O to Bl, keeping the user's OX value", async () => {
    await openTable([storedRow("r1", 0, 10, { redoxCode: "O", ox: "2" })]);
    expectNoRuleError("OX, row 1");

    select("Redox Code, row 1");
    paste("Redox Code, row 1", "Bl");
    clearSelection();

    expectRuleError("OX, row 1", MESSAGES.oxMustBeEmpty);
    expect(cell("OX, row 1")).toHaveValue("2");   // never cleared automatically
  });

  it("judges a multi-cell paste on its final combination", async () => {
    await openTable([storedRow("r1", 0, 10), storedRow("r2", 10, 20)]);

    // OX, Sedim, Redox Code on two rows: row 1 valid together, row 2 two problems.
    select("OX, row 1");
    paste("OX, row 1", "2\t\tO\n2\t\tBl");
    clearSelection();
    expect(showToast).not.toHaveBeenCalled();

    expect(cell("Redox Code, row 1")).toHaveValue("O");
    expect(cell("OX, row 1")).toHaveValue("2");
    expectNoRuleError("OX, row 1");
    expectRuleError("OX, row 2", MESSAGES.oxMustBeEmpty);
  });

  it("checks a typed value from the lookup list like any other entry", async () => {
    const user = await openTable([storedRow("r1", 0, 10)]);

    await user.click(cell("Litho Code, row 1"));
    await user.clear(cell("Litho Code, row 1"));
    await user.type(cell("Litho Code, row 1"), "0-C");
    await user.click(screen.getByRole("option", { name: "0-C" }));

    expectRuleError("CA, row 1", MESSAGES.caRequired);
  });

  it("applies to a newly inserted row", async () => {
    const user = await openTable([storedRow("r1", 0, 10)]);

    await user.click(screen.getByRole("button", { name: "Add Row (F4)" }));
    await waitFor(() => expect(cell("Litho Code, row 2")).toBeInTheDocument());
    expectNoRuleError("CA, row 2");

    select("Litho Code, row 2");
    paste("Litho Code, row 2", "26C");
    clearSelection();
    expectRuleError("CA, row 2", MESSAGES.caRequired);
  });

  it("copying cells changes nothing", async () => {
    await openTable([storedRow("r1", 0, 10, { redoxCode: "Bl", ox: "2" })]);
    select("Redox Code, row 1");
    select("OX, row 1");

    fireEvent.copy(cell("OX, row 1"), {
      clipboardData: { setData: vi.fn(), getData: () => "" },
    });

    expect(cell("Redox Code, row 1")).toHaveValue("Bl");
    expect(cell("OX, row 1")).toHaveValue("2");
    // Still selected (blue), but the rule message stays on the cell.
    expect(cellOf("OX, row 1")).toHaveAttribute("title", MESSAGES.oxMustBeEmpty);
  });
});
