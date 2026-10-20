/*
 * The signed-in Windows domain user, as "DOMAIN\username".
 *
 * Used for two pieces of metadata:
 *   - `created_by` stamped on a NEW Raw Litho document;
 *   - "Uploaded By" shown on the Upload Data page.
 *
 * NO TRUSTED SOURCE EXISTS YET, so this always resolves to null and every
 * caller shows "Unavailable" / leaves `created_by` unset. Nothing is guessed:
 * a browser cannot read the Windows login, and the hostname, user agent or any
 * typed-in name would not be a trusted identity.
 *
 * What is missing (backend, not part of the frontend):
 *   1. Windows Authentication on the API (IIS `windowsAuthentication`, or
 *      `AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate()`
 *      with `UseAuthentication()` in Program.cs);
 *   2. an endpoint returning `HttpContext.User.Identity.Name`, e.g.
 *      `GET /api/currentuser` → `{ "userName": "DOMAIN\\username" }`.
 *
 * Once both exist, implement the request here (with `credentials: "include"`)
 * and every caller picks the name up unchanged.
 */
export async function getCurrentWindowsUser(): Promise<string | null> {
  return null;
}
