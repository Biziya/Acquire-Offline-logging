/*
 * GET /api/dataviewer?drillhole=… — the stored MyApps.CoreDescrData rows of
 * one drillhole, exactly as the database holds them (one row per interval and
 * attribute: NAME / VALUE). Numbers stay numbers, dates arrive as ISO text,
 * NULL arrives as null.
 */
export type DataViewerValue = string | number | boolean | null;

export interface DataViewerRecord {
  holeId: string | null;
  projectCode: string | null;
  from: DataViewerValue;
  to: DataViewerValue;
  priority: DataViewerValue;
  name: string | null;
  value: string | null;
  commentValue: string | null;
  consistentCheck: DataViewerValue;
  usr: string | null;
  fileName: string | null;
  pathName: string | null;
  createdAt: DataViewerValue;
  modifiedAt: DataViewerValue;
  importedBy: string | null;
}

export interface DataViewerResponse {
  drillhole: string;
  /* From the drillhole list; null when it has no single match (never guessed). */
  project: string | null;
  campaign: string | null;
  totalRecords: number;
  records: DataViewerRecord[];
}

export type DataViewerColumnKey = keyof DataViewerRecord;

/*
 * Table columns in the query's order, labelled with the database column names
 * so a value can be traced straight back to the table. `width` is relative
 * (see toPercentWidths). `depth` columns are shown with at least two decimals.
 */
export const DATA_VIEWER_COLUMNS: readonly {
  key: DataViewerColumnKey;
  label: string;
  width: number;
  depth?: true;
}[] = [
  { key: "holeId", label: "HOLEID", width: 110 },
  { key: "projectCode", label: "PROJECTCODE", width: 95 },
  { key: "from", label: "FROM", width: 62, depth: true },
  { key: "to", label: "TO", width: 62, depth: true },
  { key: "priority", label: "PRIORITY", width: 64 },
  { key: "name", label: "NAME", width: 125 },
  { key: "value", label: "VALUE", width: 105 },
  { key: "commentValue", label: "COMMENT_VALUE", width: 150 },
  { key: "consistentCheck", label: "CONSISTENTCHECK", width: 110 },
  { key: "usr", label: "usr", width: 110 },
  { key: "fileName", label: "FileName", width: 120 },
  { key: "pathName", label: "PathName", width: 130 },
  { key: "createdAt", label: "Created_at", width: 140 },
  { key: "modifiedAt", label: "Modified_at", width: 140 },
  { key: "importedBy", label: "Imported_by", width: 110 },
];
