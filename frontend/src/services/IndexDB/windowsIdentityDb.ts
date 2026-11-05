import { isRecord } from "../../types/validation";
import { readValue, SESSION_STORE, writeValue } from "./rawLithoDatabase";

export interface CachedWindowsIdentity {
  id: "current-user";
  domain: string;
  username: string;
  fullUsername: string;
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
  const identity: CachedWindowsIdentity = {
    id: "current-user", domain: value.domain, username: value.username,
    fullUsername: value.domain ? `${value.domain}\\${value.username}` : value.username,
    lastUpdated: value.lastUpdated,
  };
  // Upgrade the old record in place, preserving its identity and timestamp.
  if (value.id !== identity.id || value.fullUsername !== identity.fullUsername) {
    await writeValue(SESSION_STORE, IDENTITY_KEY, identity).catch(() => undefined);
  }
  return identity;
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
    id: "current-user", domain, username, fullUsername: name,
    lastUpdated: new Date().toISOString(),
  } satisfies CachedWindowsIdentity);
}
