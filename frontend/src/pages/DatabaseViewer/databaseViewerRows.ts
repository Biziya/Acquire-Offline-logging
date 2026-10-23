import type { RowField } from "../../types/domain";
import type { DataViewerRecord, DataViewerValue } from "./databaseViewerTypes";

/*
 * The database keeps one row per interval AND attribute (NAME / VALUE). The
 * viewer shows them like Raw Litho: one row per interval, one column per
 * attribute. This is the upload procedure's mapping read backwards
 * (backend README, "JSON → database mapping"); values are copied, never
 * changed.
 */
const FIELD_BY_NAME: Readonly<Record<string, RowField>> = {
  LITHOFACIES: "lithoCode",
  COLOUR: "colorCode",
  REDOXFACIES: "redoxCode",
  CA: "ca",
  OM: "om",
  OX: "ox",
  INTERNALSTRUCTURE: "sedim",
  GRANULO: "granulo",
  HARDNESS: "hardness",
  LITHOLOGYCOMMENTS: "lithologyComments",
};

export interface DataViewerRow {
  key: string;
  lithoFrom: DataViewerValue;
  lithoTo: DataViewerValue;
  /* Attribute values by Raw Litho field; a missing attribute is absent. */
  values: Partial<Record<RowField, string>>;
}

export interface DataViewerTable {
  rows: DataViewerRow[];
  /* Stored values the Raw Litho columns cannot show (other NAMEs, repeats). */
  hiddenValues: number;
  /* Distinct `usr` and `FileName` of the stored rows, for the summary line. */
  storedBy: string[];
  fileNames: string[];
}

function cellValue(value: DataViewerValue) {
  return value === null ? "" : String(value);
}

function distinct(values: (string | null)[]) {
  return [...new Set(values.filter((value): value is string => !!value?.trim()))];
}

/*
 * One row per interval and upload: rows that share FROM, TO, PRIORITY, usr
 * and PROJECTCODE belong together. Rows keep the API's order (FROM, TO,
 * PRIORITY, NAME); a value is VALUE, or COMMENT_VALUE when VALUE is empty
 * (comments).
 */
export function buildDataViewerTable(records: readonly DataViewerRecord[]): DataViewerTable {
  const rowsByKey = new Map<string, DataViewerRow>();
  let hiddenValues = 0;

  records.forEach((record) => {
    const field = FIELD_BY_NAME[(record.name ?? "").trim().toUpperCase()];
    const key = [record.from, record.to, record.priority, record.usr, record.projectCode]
      .map(cellValue)
      .join("|");

    let row = rowsByKey.get(key);
    if (!field || row?.values[field] !== undefined) {
      hiddenValues += 1;
      return;
    }

    if (!row) {
      row = { key, lithoFrom: record.from, lithoTo: record.to, values: {} };
      rowsByKey.set(key, row);
    }

    row.values[field] = record.value?.trim() ? record.value : (record.commentValue ?? record.value ?? "");
  });

  return {
    rows: [...rowsByKey.values()],
    hiddenValues,
    storedBy: distinct(records.map((record) => record.usr)),
    fileNames: distinct(records.map((record) => record.fileName)),
  };
}
