import { useEffect, useState } from "react";
import { getCurrentWindowsUser } from "../services/currentUser";
import { readCachedWindowsIdentity } from "../services/IndexDB/windowsIdentityDb";

// Display only. Editing and authorization continue to use verified identity.
export function useCachedWindowsIdentity() {
  const [fullUsername, setFullUsername] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    let timer: number | undefined;

    async function restore() {
      try {
        const cached = await readCachedWindowsIdentity();
        if (active && cached) setFullUsername(cached.fullUsername);
      } catch {
        // Storage failure must not clear an identity already displayed.
      }
    }

    async function synchronize(forceRefresh = false) {
      if (!active || refreshing) return;
      refreshing = true;
      window.clearTimeout(timer);
      try {
        // The shared service awaits its cache write attempt. Read the
        // record back so a failed write cannot masquerade as persisted data.
        const verified = await getCurrentWindowsUser(forceRefresh);
        if (verified && active) await restore();
      } catch {
        // Backend failure leaves the last persisted display untouched.
      } finally {
        refreshing = false;
        if (active) timer = window.setTimeout(synchronize, 10_000);
      }
    }

    function onOnline() {
      void synchronize(true);
    }

    // Restore and publish the local record before any display-triggered fetch.
    void restore().then(() => {
      if (!active) return;
      window.addEventListener("online", onOnline);
      void synchronize();
    });

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return fullUsername;
}
