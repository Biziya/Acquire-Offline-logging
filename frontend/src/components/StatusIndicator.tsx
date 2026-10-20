import { useEffect, useState } from "react";
import { getBackendStatus } from "../services/Api/backendStatus";
import "./StatusIndicator.css";

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
      className={`status-indicator status-indicator--${connectionStatus}`}
      role="status"
      aria-live="polite"
      title={isOnline ? "Backend online" : "Backend offline"}
    >
      <span className="status-indicator__light" />

      <span className="status-indicator__text">
        {isOnline ? "Online" : "Offline"}
      </span>
    </div>
  );
}

export default StatusIndicator;
