import { useEffect, useState } from "react";
import { getBackendStatus } from "../services/Api/backendStatus";

const CHECK_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 900;

// Until the first check answers, say so instead of claiming "Offline".
const STATUS = {
  checking: { label: "Checking…", title: "Checking the server", light: "bg-rl-side-muted" },
  online: { label: "Online", title: "Server online", light: "bg-rl-side-online" },
  offline: { label: "Offline", title: "Server offline", light: "bg-rl-side-offline" },
} as const;

function StatusIndicator() {
  const [connectionStatus, setConnectionStatus] = useState("checking");

  useEffect(() => {
    let stopped = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let activeController: AbortController | undefined;

    async function checkBackendConnection() {
      activeController = new AbortController();

      const timeoutId = setTimeout(() => {
        activeController?.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        await getBackendStatus(activeController.signal);

        if (!stopped) {
          setConnectionStatus("online");
        }
      } catch {
        if (!stopped) {
          setConnectionStatus("offline");
        }
      } finally {
        clearTimeout(timeoutId);

        if (!stopped) {
          timerId = setTimeout(checkBackendConnection, CHECK_INTERVAL_MS);
        }
      }
    }

    checkBackendConnection();

    return () => {
      stopped = true;
      clearTimeout(timerId);
      activeController?.abort();
    };
  }, []);

  const status = STATUS[connectionStatus as keyof typeof STATUS] ?? STATUS.checking;

  return (
    <div
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      role="status"
      aria-live="polite"
      title={status.title}
    >
      <span className={`size-2.5 rounded-full ${status.light}`} />

      {/* Hidden when the sidebar is collapsed, leaving only the light. */}
      <span className="group-data-[collapsed=true]/sidebar:hidden">
        {status.label}
      </span>
    </div>
  );
}

export default StatusIndicator;
