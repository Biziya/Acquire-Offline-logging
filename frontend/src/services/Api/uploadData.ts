import type { UploadResponse } from "../../types/domain";
import { isRecord, isAbortError } from "../../types/validation";
import { buildApiUrl } from "./apiConfig";

/*
 * The backend gives the stored procedure up to 120 s; wait a little longer
 * before giving up, so a slow upload is not reported as failed too early.
 */
const UPLOAD_TIMEOUT_MS = 180_000;

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/*
 * The backend's { success, message, errors? } body. Only its JSON message is
 * shown, with the first row error when there is one; a non-JSON body (an
 * HTML or stack-trace page from a proxy or a crashed server) is never shown.
 */
function getErrorMessage(body: unknown): string {
  if (!isRecord(body)) return "Upload failed";

  const message = ["message", "detail", "title"]
    .map((key) => body[key])
    .find((value): value is string => typeof value === "string" && !!value.trim());
  if (!message) return "Upload failed";

  const errors = Array.isArray(body.errors)
    ? body.errors.filter((error): error is string => typeof error === "string")
    : [];
  if (errors.length === 0) return message;

  return `${message} ${errors[0]}${errors.length > 1 ? " (and other errors)" : ""}`;
}

export async function importUploadData(
  file: File,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  let response;
  const formData = new FormData();
  formData.append("file", file, file.name);
  const timeout = AbortSignal.timeout(UPLOAD_TIMEOUT_MS);

  try {
    response = await fetch(buildApiUrl("/api/upload-data"), {
      method: "POST",
      body: formData,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) {
      throw new Error("Upload timed out", { cause: error });
    }

    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Server unavailable", {
      cause: error,
    });
  }

  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body));
  }

  if (typeof body === "string" && body.trim()) {
    return { message: body.trim() };
  }

  if (!isRecord(body)) return {};
  if (body.message !== undefined && typeof body.message !== "string")
    throw new Error("Invalid upload response");
  return {
    ...body,
    message: typeof body.message === "string" ? body.message : undefined,
  };
}
