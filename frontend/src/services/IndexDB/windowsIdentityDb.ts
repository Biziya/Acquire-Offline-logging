import { isRecord } from "../../types/validation";
import { readValue, SESSION_STORE, writeValue } from "./rawLithoDatabase";

export interface CachedWindowsIdentity {
  domain: string;
  username: string;
  lastUpdated: string;
}

const IDENTITY_KEY = "windows-identity";

// This record is a local cache only; never use it to authorize or stamp edits.
export async function readCachedWindowsIdentity(): Promise<CachedWindowsIdentity | null> {
  const value = await readValue(SESSION_STORE, IDENTITY_KEY);
  if (!isRecord(value) || typeof value.domain !== "string" ||
      typeof value.username !== "string" || !value.username.trim() ||
      typeof value.lastUpdated !== "string" || !Number.isFinite(Date.parse(value.lastUpdated))) {
    return null;
  }
  return { domain: value.domain, username: value.username, lastUpdated: value.lastUpdated };
}

export async function cacheVerifiedWindowsIdentity(
  name: string,
  cached: CachedWindowsIdentity | null,
): Promise<void> {
  const separator = name.indexOf("\\");
  const domain = separator > 0 ? name.slice(0, separator) : "";
  const username = separator > 0 ? name.slice(separator + 1) : name;
  if (cached?.domain === domain && cached.username === username) return;
  await writeValue(SESSION_STORE, IDENTITY_KEY, {
    domain, username, lastUpdated: new Date().toISOString(),
  } satisfies CachedWindowsIdentity);
}
