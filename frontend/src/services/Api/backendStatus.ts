import { isRecord } from "../../types/validation";
import { buildApiUrl } from "./apiConfig";

export async function getBackendStatus(signal?: AbortSignal) {
  const response = await fetch(buildApiUrl("/api/status"), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }

  const data: unknown = await response.json();

  if (!isRecord(data) || data.status !== "online") {
    throw new Error("Backend did not return online status");
  }

  return data;
}
