import { buildApiUrl } from "./Api/apiConfig";
import { isRecord } from "../types/validation";

/*
 * The signed-in Windows user: "BEK" for a local account, "COMPANY\bek" for a
 * domain account. This is the one identity source for the whole app:
 *   - `created_by` stamped on a NEW Raw Litho document, and `edited_by` on
 *     each committed edit (Raw Litho and Upload Data);
 *   - "Imported By" on Upload Data and the user name in the sidebar.
 *
 * A browser cannot read the Windows login (JavaScript has no API for it), so
 * the backend proves it: GET /api/whoami answers with a Windows Integrated
 * Authentication challenge (Negotiate: Kerberos or NTLM), the browser
 * authenticates the signed-in user automatically for localhost / Local
 * intranet sites, and the response carries `userName`. It is the same user
 * the backend records for an upload. The plain status poll (StatusIndicator)
 * stays anonymous.
 *
 * An error status (e.g. 401 when the browser did not send Windows
 * credentials), a malformed body or a network failure gives null, and callers
 * show a neutral placeholder and leave `created_by` / `edited_by` unset.
 * Nothing is ever guessed — not the hostname, the user agent, a build-time
 * user name or anything the user types.
 */
const CURRENT_USER_PATH = "/api/whoami";
const MAX_USER_NAME_LENGTH = 256;

let request: Promise<string | null> | null = null;

async function requestCurrentUser(): Promise<string | null> {
  try {
    const response = await fetch(buildApiUrl(CURRENT_USER_PATH), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const body: unknown = await response.json();
    const userName =
      isRecord(body) && typeof body.userName === "string"
        ? body.userName.trim()
        : "";

    return userName && userName.length <= MAX_USER_NAME_LENGTH ? userName : null;
  } catch {
    return null;
  }
}

/*
 * Callers share one request. A verified name is kept for the rest of the page
 * load; a failed lookup (backend not started yet, 401, network error) is
 * forgotten, so the next call asks again instead of staying empty until a
 * refresh.
 */
export function getCurrentWindowsUser(): Promise<string | null> {
  if (!request) {
    const pending = requestCurrentUser();
    request = pending;
    pending.then((name) => {
      if (name === null && request === pending) request = null;
    });
  }
  return request;
}
