import { Agent } from "node:http";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_PROXY_TARGET || "http://localhost:7047";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        /*
         * Windows Integrated Authentication (NTLM) authenticates a connection,
         * not a request: its handshake for /api/status?includeUser=true must
         * reach the backend over one socket. This dev-only agent keeps a
         * single upstream connection alive for /api/status. Listed first so it
         * wins over "/api".
         */
        "/api/status": {
          target,
          changeOrigin: true,
          agent: new Agent({ keepAlive: true, maxSockets: 1 }),
        },
        "/api": {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});
