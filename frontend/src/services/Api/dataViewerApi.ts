import { isRecord } from "../../types/validation";
import type {
  DataViewerInterval,
  DataViewerProject,
  DataViewerResponse,
} from "../../pages/DatabaseViewer/databaseViewerTypes";
import { buildApiUrl } from "./apiConfig";

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCell(value: unknown) {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isProject(value: unknown): value is DataViewerProject {
  return isRecord(value) && typeof value.projectCode === "string" && isNullableString(value.campaign);
}

function isInterval(value: unknown): value is DataViewerInterval {
  return (
    isRecord(value) &&
    isNullableString(value.projectCode) &&
    isCell(value.lithoFrom) &&
    isCell(value.lithoTo) &&
    isCell(value.priority) &&
    isNullableString(value.usr) &&
    isRecord(value.values) &&
    Object.values(value.values).every(isNullableString)
  );
}

function isDataViewerResponse(body: unknown): body is DataViewerResponse {
  return (
    isRecord(body) &&
    typeof body.drillhole === "string" &&
    isNullableString(body.project) &&
    isNullableString(body.campaign) &&
    Array.isArray(body.projects) &&
    body.projects.every(isProject) &&
    typeof body.totalIntervals === "number" &&
    typeof body.totalRecords === "number" &&
    typeof body.hiddenValues === "number" &&
    isStringArray(body.storedBy) &&
    isStringArray(body.fileNames) &&
    Array.isArray(body.intervals) &&
    body.intervals.every(isInterval)
  );
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(buildApiUrl(path), {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Data Viewer request failed with HTTP ${response.status}.`);
  }

  return response.json();
}

/* Read-only: every drillhole with stored records (distinct CoreDescrData.HOLEID). */
export async function getDataViewerDrillholes(signal?: AbortSignal): Promise<string[]> {
  const body = await getJson("/api/dataviewer/drillholes", signal);
  if (!isStringArray(body)) {
    throw new Error("The Data Viewer API returned an invalid drillhole list.");
  }

  return body;
}

/* Read-only: the stored intervals of one drillhole (HOLEID). */
export async function getDataViewerRecords(
  drillhole: string,
  signal?: AbortSignal,
): Promise<DataViewerResponse> {
  const query = new URLSearchParams({ drillhole });
  const body = await getJson(`/api/dataviewer?${query}`, signal);
  if (!isDataViewerResponse(body)) {
    throw new Error("The Data Viewer API returned an invalid response.");
  }

  return body;
}
