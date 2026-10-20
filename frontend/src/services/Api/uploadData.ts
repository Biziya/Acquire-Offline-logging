import type { UploadResponse } from "../../types/domain";
import { isRecord, isAbortError } from "../../types/validation";
import { buildApiUrl } from "./apiConfig";

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

function getErrorMessage(body: unknown): string {
  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (isRecord(body)) {
    for (const key of ["detail", "message", "title"]) {
      const value = body[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "Unable to import the selected data. Please try again.";
}

export async function importUploadData(
  file: File,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  let response;
  const formData = new FormData();
  formData.append("file", file, file.name);

  try {
    response = await fetch(buildApiUrl("/api/uploaddata"), {
      method: "POST",
      body: formData,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to connect to the server. Please try again.", {
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
    throw new Error("Invalid upload response message.");
  return {
    ...body,
    message: typeof body.message === "string" ? body.message : undefined,
  };
}
