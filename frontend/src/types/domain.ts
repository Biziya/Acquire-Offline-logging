import type { HTMLAttributes } from "react";
import type { RawLithoRow, RowField } from "./rawLithoSchema";

export type RowId = string | number;

export type { RowField, RawLithoRow } from "./rawLithoSchema";

export interface RawLithoDocument {
  project: string;
  campaign: string;
  drillhole: string;
  /*
   * Windows domain user ("DOMAIN\username") who created the dataset. Optional:
   * set only on a new document when a trusted identity is available, then
   * carried unchanged through edits, autosave, import and export. Legacy
   * documents have none, and the current user is never filled in for them.
   */
  created_by?: string;
  /*
   * Windows domain user who made the last committed edit. Optional: stamped
   * with each edit when a trusted identity is available, and otherwise left as
   * it was. Loading a draft never changes it. There is no `imported_by` here:
   * the importer is shown on Upload Data, never written into the JSON.
   */
  edited_by?: string;
  created_at: string;
  modified_at: string;
  rows: RawLithoRow[];
}

export interface DocumentFallback extends Partial<RawLithoDocument> {
  createdAt?: string;
  modifiedAt?: string;
}

export interface Drillhole {
  holeId: string;
  projectCode: string;
  campaign: string;
}

export interface LookupRecord {
  [property: string]: unknown;
}

export interface LookupDefinition {
  fieldKey: RowField;
  label: string;
  codeProperty: string;
  source?: "local";
  options?: readonly LookupRecord[];
  maxLength?: number;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  isInputAllowed?: (value: string) => boolean;
}

export interface ApiLookupDefinition extends LookupDefinition {
  endpoint: string;
  cacheKey: string;
}

export type LookupData = Partial<Record<RowField, readonly LookupRecord[]>>;

export interface LookupStatus {
  isLoading: boolean;
  error: string;
  source: "cache" | "backend" | null;
}

export type LookupStatuses = Partial<Record<RowField, LookupStatus>>;

/*
 * A toast: what to say and how serious it is. How long it stays is set per
 * type in config/ui.yaml, never by the caller.
 */
export interface ToastNotification {
  message: string;
  type: "success" | "warning" | "error" | "info";
}

export interface ToastState extends ToastNotification {
  id: number;
}

export type Notify = (notification: ToastNotification) => void;

export type RowIssueKind =
  "missingRequiredFields" | "invalidDepthRange" | "duplicateInterval";

export interface RowIssue {
  issue: RowIssueKind;
  fieldKey: RowField;
}

export type AddRowResult =
  | { created: true; rowId: RowId }
  | { created: false; rowId?: RowId; focusField?: RowField };

export type RowChange = (rowId: RowId, field: RowField, value: string) => void;

export interface ImportPlan {
  document: RawLithoDocument;
  draftKey: string;
  drillhole: string;
  rowCount: number;
  willReplaceExistingDraft: boolean;
}

export interface ImportResult {
  document: RawLithoDocument;
  draftKey: string;
  nextRowId?: number;
}

export interface DraftSession {
  drillhole: string;
  page: number;
}

export interface LookupCache {
  cacheKey: string;
  records: LookupRecord[];
  updatedAt: string;
}

export interface UploadResponse {
  message?: string;
  [key: string]: unknown;
}

/* Display values for the Upload Data "Dataset Information" section. */
export interface DatasetInfo {
  fileName: string;
  project: string;
  campaign: string;
  drillhole: string;
  createdBy: string;
  editedBy: string;
  importedBy: string;
  totalRecords: string;
  fileSize: string;
  validationStatus: string;
}

export type Clock = () => string;
