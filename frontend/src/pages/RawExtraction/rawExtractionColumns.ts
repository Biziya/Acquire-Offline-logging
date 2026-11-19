import type { LookupRecord } from "../../types/domain";
import { toPercentWidths } from "../../components/dataTableStyles";

/*
 * Raw Extraction table columns, in the order of the old desktop screen. The
 * first two are dropdowns, the rest plain inputs. Values are kept as typed
 * text; nothing is calculated or validated yet (the page is not connected to
 * the database).
 */
export type RawExtractionField =
  | "extractionType"
  | "coringMethod"
  | "corePass"
  | "startDepth"
  | "endDepth"
  | "recovered"
  | "recoveryPct"
  | "mudLayerPct"
  | "mudImpPct";

export type RawExtractionRow = { id: number } & Record<RawExtractionField, string>;

export interface RawExtractionLookup {
  label: string;
  codeProperty: "code";
  options: readonly LookupRecord[];
}

// Placeholder lists until the page reads the real ones from the database.
const EXTRACTION_TYPES = Object.freeze([{ code: "CAROTTE" }, { code: "DESTRUCTIF" }]);
const CORING_METHODS = Object.freeze([
  { code: "Double tube coring" },
  { code: "Triple tube coring" },
  { code: "Single tube coring" },
]);

interface ColumnDefinition {
  key: RawExtractionField;
  label: string;
  width: number;
  lookup?: RawExtractionLookup;
}

const COLUMNS: readonly ColumnDefinition[] = [
  {
    key: "extractionType",
    label: "Extraction Type",
    width: 120,
    lookup: { label: "Extraction Type", codeProperty: "code", options: EXTRACTION_TYPES },
  },
  {
    key: "coringMethod",
    label: "Coring Method",
    width: 150,
    lookup: { label: "Coring Method", codeProperty: "code", options: CORING_METHODS },
  },
  { key: "corePass", label: "Core Pass #", width: 70 },
  { key: "startDepth", label: "Start Depth (m)", width: 80 },
  { key: "endDepth", label: "End Depth (m)", width: 80 },
  { key: "recovered", label: "Recovered (m)", width: 80 },
  { key: "recoveryPct", label: "Recovery (%)", width: 80 },
  { key: "mudLayerPct", label: "Mud Layer (%)", width: 80 },
  { key: "mudImpPct", label: "Mud Imp (%)", width: 80 },
];

const widths = toPercentWidths(COLUMNS.map((column) => column.width));

export const rawExtractionColumns = COLUMNS.map((column, index) => ({
  ...column,
  width: widths[index] ?? "auto",
}));
