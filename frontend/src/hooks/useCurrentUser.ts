import { useEffect, useState } from "react";
import { getCurrentWindowsUser } from "../services/currentUser";

/*
 * The signed-in Windows domain user ("DOMAIN\username"), or null when no
 * trusted identity is available — which is always the case today; see
 * services/currentUser.ts. A failed lookup also gives null, never a guess.
 */
export function useCurrentUser() {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    getCurrentWindowsUser().then(
      (name) => {
        if (isActive) setUserName(name?.trim() || null);
      },
      () => {
        if (isActive) setUserName(null);
      },
    );

    return () => {
      isActive = false;
    };
  }, []);

  return userName;
}
