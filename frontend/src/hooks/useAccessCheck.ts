import { useCallback, useEffect, useState } from "react";
import { checkWebsiteAccess, type WebsiteAccess } from "../services/websiteAccess";

// While the backend has not answered (offline, or no Windows login yet).
const RETRY_MS = 10_000;
// Once it has: notice group changes without a reload.
const REFRESH_MS = 60_000;

/*
 * The website access of the signed-in Windows user (see
 * services/websiteAccess.ts), or null while the first check runs. retry()
 * asks the backend again right away.
 */
export function useAccessCheck() {
  const [access, setAccess] = useState<WebsiteAccess | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isActive = true;
    let timer: number | undefined;

    function check(forceRefresh: boolean) {
      checkWebsiteAccess(forceRefresh)
        .catch((): WebsiteAccess => ({ status: "unverified", userName: null, source: "none" }))
        .then((result) => {
          if (!isActive) return;
          setAccess(result);
          timer = window.setTimeout(
            () => check(false),
            result.source === "backend" ? REFRESH_MS : RETRY_MS,
          );
        });
    }

    check(attempt > 0);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return { access, retry };
}
