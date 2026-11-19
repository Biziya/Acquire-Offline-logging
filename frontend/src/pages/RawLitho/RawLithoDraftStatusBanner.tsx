import { useRawLithoDraftStatus } from "./rawLithoDraftStatus";

const BANNER =
  "mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border px-3 py-2 text-[0.8125rem]";
const DANGER = `${BANNER} border-rl-danger bg-rl-danger-soft text-rl-danger`;
const NOTICE = `${BANNER} border-rl-border bg-rl-surface text-rl-text`;
const RELOAD_BUTTON =
  "rounded-sm border border-current px-2 py-0.5 font-semibold hover:opacity-80";

/*
 * Stays on screen for as long as the draft storage has a problem the logger
 * must know about. A toast is shown once and can be missed; this cannot.
 */
export default function RawLithoDraftStatusBanner() {
  const { saveError, openElsewhere, databaseOutdated } = useRawLithoDraftStatus();

  return (
    <>
      {databaseOutdated && (
        <div className={DANGER} role="alert">
          <span>
            <strong>Reload needed.</strong> Raw Litho was updated in another
            tab, so this tab can no longer save. Your unsaved edits are still
            on screen.
          </span>
          <button
            className={RELOAD_BUTTON}
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )}
      {saveError && !databaseOutdated && (
        <div className={DANGER} role="alert">
          <span>
            <strong>Not saved on this PC.</strong> Your latest edits exist only
            in this tab. Keep it open; saving is retried automatically.
          </span>
        </div>
      )}
      {openElsewhere && (
        <div className={NOTICE} role="status">
          <span>
            <strong>Read-only.</strong> This drillhole is open in another tab or
            window. Close it there to edit here.
          </span>
        </div>
      )}
    </>
  );
}
