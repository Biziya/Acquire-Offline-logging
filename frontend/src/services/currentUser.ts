/*
 * The signed-in user, resolved by the frontend. This is the one identity
 * source for the whole app:
 *   - `created_by` stamped on a NEW Raw Litho document, and `edited_by` on
 *     each committed edit (Raw Litho and Upload Data);
 *   - "Imported By" on Upload Data and the user name in the sidebar.
 *
 * A browser cannot read the Windows login: JavaScript has no API for it, and
 * the app has no single sign-on provider of its own. Until one exists (for
 * example an SSO session token issued to this app), there is no VERIFIED user,
 * so this returns null: the sidebar shows "User not identified", Imported By
 * shows "—", and `created_by` / `edited_by` are left unset.
 *
 * Nothing is ever guessed — not the host name, the user agent, a build-time
 * user name, browser fingerprinting, or anything the user types. To add a
 * trusted provider later, resolve its verified name here; every caller already
 * handles both a name and null.
 *
 * (The backend's GET /api/currentuser, which proved the Windows user through
 * Windows Integrated Authentication, was removed with the move to five APIs.)
 */
export async function getCurrentWindowsUser(): Promise<string | null> {
  return null;
}
