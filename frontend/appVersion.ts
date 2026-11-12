import { readFileSync } from "node:fs";

// package.json "version", for the define in vite.config.ts and vitest.config.ts.
export const appVersion: string = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }
).version;
