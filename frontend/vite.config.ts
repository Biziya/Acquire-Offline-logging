import { Agent } from "node:http";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { appVersion } from "./appVersion";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_PROXY_TARGET || "http://localhost:7047";
  /*
   * Windows Integrated Authentication (NTLM) authenticates a connection, not
   * a request: its handshake must reach the backend over one socket. With
   * Auth:AllowedGroup (or Database:ImpersonateWindowsUser) every API needs the
   * Windows user, not only /api/status?includeUser=true, so this dev-only
   * agent keeps a single upstream connection alive for all of /api.
   */
  const windowsAuthAgent = new Agent({ keepAlive: true, maxSockets: 1 });
  return {
    plugins: [react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    server: {
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          agent: windowsAuthAgent,
        },
      },
    },
  };
});
