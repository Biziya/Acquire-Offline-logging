import type { RowField } from "../../types/domain";

/*
 * GET /api/dataviewer?drillhole=… — the stored MyApps.CoreDescrData lithology
 * of one drillhole, already one entry per interval (the backend groups the
 * NAME / VALUE rows). Depths stay numbers as stored; NULL arrives as null.
 */
export type DataViewerValue = string | number | boolean | null;

export interface DataViewerInterval {
  projectCode: string | null;
  lithoFrom: DataViewerValue;
  lithoTo: DataViewerValue;
  priority: DataViewerValue;
  usr: string | null;
  /* Attribute values by Raw Litho field; an attribute not stored is absent. */
  values: Partial<Record<RowField, string | null>>;
}

export interface DataViewerProject {
  projectCode: string;
  /* From the drillhole list for the same HOLEID and PROJECTCODE; null when not exactly one. */
  campaign: string | null;
}

export interface DataViewerResponse {
  drillhole: string;
  /* Null unless the drillhole has exactly one stored project (never guessed). */
  project: string | null;
  campaign: string | null;
  projects: DataViewerProject[];
  totalIntervals: number;
  /* Stored CoreDescrData rows (one per interval and NAME). */
  totalRecords: number;
  /* Stored values with no Raw Litho column (another NAME, or a repeat). */
  hiddenValues: number;
  storedBy: string[];
  fileNames: string[];
  intervals: DataViewerInterval[];
}

/* Stable row identity: the backend's grouping key, unique per interval. */
export function intervalKey(interval: DataViewerInterval) {
  return [interval.projectCode, interval.lithoFrom, interval.lithoTo, interval.priority, interval.usr]
    .map((part) => (part === null ? "" : String(part)))
    .join("|");
}
