import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { appVersion } from "./appVersion";
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
  },
});
