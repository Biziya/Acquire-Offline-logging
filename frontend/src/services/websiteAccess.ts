import { isRecord } from "../types/validation";
import { getVerifiedWindowsIdentity } from "./currentUser";
import { readValue, SESSION_STORE, writeValue } from "./IndexDB/rawLithoDatabase";

/*
 * Whether the signed-in Windows user may use the website: only members of the
 * backend's Auth:AllowedGroup AD group (e.g. BDOM\AcQuire_Uploaders).
 *
 * The backend decides and enforces it (every API call from a non-member is
 * 403); this only chooses what the website shows. The answer comes from
 * GET /api/status?includeUser=true (`isAuthorized`).
 *
 * The app works offline, so the last answer the backend gave is kept in
 * IndexedDB and used while the backend cannot be reached. Someone who has
 * never been verified on this browser is "unverified" until the backend
 * answers.
 */
export type WebsiteAccessStatus = "allowed" | "denied" | "unverified";

export interface WebsiteAccess {
  status: WebsiteAccessStatus;
  userName: string | null;
  // backend: answered just now; cache: last answer, backend unreachable.
  source: "backend" | "cache" | "none";
}

interface CachedWebsiteAccess {
  userName: string;
  fullUsername: string;
  isAuthorized: boolean;
  lastUpdated: string;
}

const ACCESS_KEY = "website-access";

async function readCachedAccess(): Promise<CachedWebsiteAccess | null> {
  const value = await readValue(SESSION_STORE, ACCESS_KEY);
  if (!isRecord(value) || typeof value.userName !== "string" || !value.userName.trim() ||
      typeof value.fullUsername !== "string" || typeof value.isAuthorized !== "boolean" ||
      typeof value.lastUpdated !== "string") {
    return null;
  }
  return {
    userName: value.userName,
    fullUsername: value.fullUsername,
    isAuthorized: value.isAuthorized,
    lastUpdated: value.lastUpdated,
  };
}

export async function checkWebsiteAccess(forceRefresh = false): Promise<WebsiteAccess> {
  const identity = await getVerifiedWindowsIdentity(forceRefresh).catch(() => null);

  if (identity) {
    await writeValue(SESSION_STORE, ACCESS_KEY, {
      userName: identity.userName,
      fullUsername: identity.fullUsername,
      isAuthorized: identity.isAuthorized,
      lastUpdated: new Date().toISOString(),
    } satisfies CachedWebsiteAccess).catch(() => undefined);

    return {
      status: identity.isAuthorized ? "allowed" : "denied",
      userName: identity.userName,
      source: "backend",
    };
  }

  const cached = await readCachedAccess().catch(() => null);
  if (cached) {
    return {
      status: cached.isAuthorized ? "allowed" : "denied",
      userName: cached.userName,
      source: "cache",
    };
  }

  return { status: "unverified", userName: null, source: "none" };
}
