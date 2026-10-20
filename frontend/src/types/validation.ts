import type { Drillhole, LookupRecord } from "./domain";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isDrillhole(value: unknown): value is Drillhole {
  return (
    isRecord(value) &&
    typeof value.holeId === "string" &&
    value.holeId.trim() !== "" &&
    typeof value.projectCode === "string" &&
    typeof value.campaign === "string"
  );
}

export function isLookupRecords(
  value: unknown,
  codeProperty?: string,
): value is LookupRecord[] {
  return (
    isUnknownArray(value) &&
    value.every(
      (record) =>
        isRecord(record) &&
        (!codeProperty || typeof record[codeProperty] === "string"),
    )
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
