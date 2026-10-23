import { isRecord } from "../../types/validation";
import {
  DATA_VIEWER_COLUMNS,
  type DataViewerRecord,
  type DataViewerResponse,
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

function isDataViewerRecord(record: unknown): record is DataViewerRecord {
  return (
    isRecord(record) &&
    DATA_VIEWER_COLUMNS.every((column) => isCell(record[column.key]))
  );
}

function isDataViewerResponse(body: unknown): body is DataViewerResponse {
  return (
    isRecord(body) &&
    typeof body.drillhole === "string" &&
    isNullableString(body.project) &&
    isNullableString(body.campaign) &&
    typeof body.totalRecords === "number" &&
    Array.isArray(body.records) &&
    body.records.every(isDataViewerRecord)
  );
}

/* Read-only: the stored records of one drillhole (HOLEID). */
export async function getDataViewerRecords(
  drillhole: string,
  signal?: AbortSignal,
): Promise<DataViewerResponse> {
  const query = new URLSearchParams({ drillhole });
  const response = await fetch(buildApiUrl(`/api/dataviewer?${query}`), {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Data Viewer request failed with HTTP ${response.status}.`);
  }

  const body: unknown = await response.json();
  if (!isDataViewerResponse(body)) {
    throw new Error("The Data Viewer API returned an invalid response.");
  }

  return body;
}
