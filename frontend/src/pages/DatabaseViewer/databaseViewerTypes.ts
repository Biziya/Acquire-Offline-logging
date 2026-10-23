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

/* Every record property; the API client checks each is a plain value. */
export const DATA_VIEWER_RECORD_KEYS: readonly (keyof DataViewerRecord)[] = [
  "holeId", "projectCode", "from", "to", "priority", "name", "value",
  "commentValue", "consistentCheck", "usr", "fileName", "pathName",
  "createdAt", "modifiedAt", "importedBy",
];
