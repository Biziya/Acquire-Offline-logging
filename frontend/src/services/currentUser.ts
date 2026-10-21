import { buildApiUrl } from "./Api/apiConfig";
import { isRecord } from "../types/validation";

/*
 * The signed-in Windows domain user, as "DOMAIN\username".
 *
 * Used for two pieces of metadata:
 *   - `created_by` stamped on a NEW Raw Litho document, and `edited_by` on
 *     each committed edit (Raw Litho and Upload Data);
 *   - "Imported By" on Upload Data and the user name in the sidebar.
 *
 * A browser cannot read the Windows login, so the name must come from the
 * backend, which learns it from Windows Integrated Authentication. The
 * frontend calls the endpoint named by VITE_CURRENT_USER_PATH (for example
 * `/api/currentuser`) and expects `{ "userName": "DOMAIN\\username" }`.
 *
 * TODAY THE BACKEND HAS NO SUCH ENDPOINT AND NO AUTHENTICATION, so the
 * variable is empty, no request is made and this resolves to null: every
 * caller shows a neutral placeholder and leaves `created_by` / `edited_by` unset. A failed or
 * malformed response is also null. Nothing is ever guessed — not the
 * hostname, the user agent or anything the user types.
 *
 * Backend work needed (not part of the frontend):
 *   1. Windows Authentication on the API: IIS `windowsAuthentication`, or
 *      `AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate()`
 *      with `UseAuthentication()` in Program.cs;
 *   2. an authenticated endpoint returning `HttpContext.User.Identity.Name`
 *      as `{ "userName": ... }`.
 * Then set VITE_CURRENT_USER_PATH and rebuild.
 */
const CURRENT_USER_PATH = (import.meta.env.VITE_CURRENT_USER_PATH ?? "").trim();
const MAX_USER_NAME_LENGTH = 256;

let request: Promise<string | null> | null = null;

async function requestCurrentUser(): Promise<string | null> {
  if (!CURRENT_USER_PATH) return null;

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

/* Asked once per page load; every caller shares the same answer. */
export function getCurrentWindowsUser(): Promise<string | null> {
  request ??= requestCurrentUser();
  return request;
}
