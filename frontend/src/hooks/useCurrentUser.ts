import { useEffect, useState } from "react";
import { getCurrentWindowsUser } from "../services/currentUser";

/*
 * The signed-in user, or null while no verified identity is available; see
 * services/currentUser.ts. A failed lookup gives null, never a guess.
 */
export function useCurrentUser() {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    getCurrentWindowsUser()
      .catch(() => null)
      .then((name) => {
        if (isActive) setUserName(name?.trim() || null);
      });

    return () => {
      isActive = false;
    };
  }, []);

  return userName;
}
