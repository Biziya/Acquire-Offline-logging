import type { WebsiteAccess } from "../../services/websiteAccess";
import { uiConfig } from "../../config/uiConfig";

interface Props {
  // null while the first access check runs.
  access: WebsiteAccess | null;
  onRetry: () => void;
}

/*
 * Shown instead of the whole app when the signed-in Windows user may not use
 * it (not in the allowed AD group), or cannot be verified yet.
 */
function AccessDenied({ access, onRetry }: Props) {
  const checking = access === null;
  const denied = access?.status === "denied";

  const title = checking
    ? "Checking your Windows account…"
    : denied
      ? "Access denied"
      : "Can't verify your Windows account";

  return (
    <main className="flex min-h-screen items-center justify-center bg-rl-navy-softer p-4">
      <section
        aria-live="polite"
        className="w-full max-w-md rounded-xl border border-rl-border bg-white p-6 text-rl-text shadow-sm"
      >
        <p className="m-0 mb-2 text-sm font-semibold text-rl-text-muted">{uiConfig.appName}</p>
        <h1 className={`m-0 mb-3 text-[1.3rem] font-[650] ${denied ? "text-rl-danger" : "text-rl-navy"}`}>
          {title}
        </h1>

        {denied && (
          <>
            <p className="m-0 mb-2">
              Your account <strong>{access.userName}</strong> is not in the Active Directory group that
              is allowed to use this website.
            </p>
            <p className="m-0 mb-4 text-rl-text-muted">
              Ask IT or your administrator to add you to the group, then sign out of Windows and sign
              back in.
            </p>
          </>
        )}

        {!checking && !denied && (
          <p className="m-0 mb-4 text-rl-text-muted">
            The website could not confirm who you are. Check that you are on the company network and
            signed in to Windows with your domain account.
          </p>
        )}

        {!checking && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-rl-navy px-4 py-2 font-semibold text-white hover:bg-rl-navy-dark"
          >
            Check again
          </button>
        )}
      </section>
    </main>
  );
}

export default AccessDenied;
