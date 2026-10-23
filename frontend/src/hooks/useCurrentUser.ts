import { useEffect, useState } from "react";
import { getCurrentWindowsUser } from "../services/currentUser";

// How often to ask again while the backend cannot verify the user yet.
const RETRY_MS = 10_000;

/*
 * The signed-in Windows user ("Bek" for a local account, "COMPANY\bek" for a
 * domain account), or null while the backend cannot verify one; see
 * services/currentUser.ts. A failed lookup gives null, never a guess.
 *
 * While the answer is null it asks again every RETRY_MS, so the name appears
 * on its own once the backend starts — no page refresh needed. It stops as
 * soon as a name arrives.
 */
export function useCurrentUser() {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let retryTimer: number | undefined;

    function lookUp() {
      getCurrentWindowsUser()
        .catch(() => null)
        .then((name) => {
          if (!isActive) return;
          const verified = name?.trim() || null;
          setUserName(verified);
          if (!verified) retryTimer = window.setTimeout(lookUp, RETRY_MS);
        });
    }

    lookUp();

    return () => {
      isActive = false;
      window.clearTimeout(retryTimer);
    };
  }, []);

  return userName;
}
