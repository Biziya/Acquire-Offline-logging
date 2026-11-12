import type { WebsiteAccess } from "../../services/websiteAccess";
import { uiConfig } from "../../config/uiConfig";
import { PRIMARY_BUTTON } from "../../components/uiStyles";

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
        className="w-full max-w-md rounded-ui border border-rl-border bg-white p-6 text-rl-text shadow-ui"
      >
        <p className="m-0 mb-2 text-sm font-semibold text-rl-text-muted">{uiConfig.appName}</p>
        <h1 className={`m-0 mb-3 text-[1.25rem] font-bold ${denied ? "text-rl-danger" : "text-rl-navy"}`}>
          {title}
        </h1>

        {denied && (
          <>
            <p className="m-0 mb-2">
              <strong>{access.userName}</strong> isn't in the group that can use this website.
            </p>
            <p className="m-0 mb-4 text-rl-text-muted">
              Ask IT to add you, then sign out of Windows and back in.
            </p>
          </>
        )}

        {!checking && !denied && (
          <p className="m-0 mb-4 text-rl-text-muted">
            Check that you're on the company network and signed in to Windows with your BDOM account.
          </p>
        )}

        {!checking && (
          <button
            type="button"
            onClick={onRetry}
            className={PRIMARY_BUTTON}
          >
            Check again
          </button>
        )}
      </section>
    </main>
  );
}

export default AccessDenied;
