import { useEffect, useState } from "react";
import { getBackendStatus } from "../services/Api/backendStatus";

const CHECK_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 900;

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

  const isOnline = connectionStatus === "online";

  return (
    <div
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      role="status"
      aria-live="polite"
      title={isOnline ? "Backend online" : "Backend offline"}
    >
      <span
        className={`size-2.5 rounded-full ${isOnline ? "bg-[#22c55e]" : "bg-[#f59e0b]"}`}
      />

      {/* Hidden when the sidebar is collapsed, leaving only the light. */}
      <span className="group-data-[collapsed=true]/sidebar:hidden">
        {isOnline ? "Online" : "Offline"}
      </span>
    </div>
  );
}

export default StatusIndicator;
