import type { LookupCache, LookupRecord } from "../../types/domain";
import { isLookupRecords, isRecord } from "../../types/validation";
const DATABASE_NAME = "raw-litho-lookup-cache-db";
const DATABASE_VERSION = 1;
const STORE_NAME = "lookups";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
export async function readLookupCache(
  cacheKey: string,
): Promise<LookupCache | null> {
  const value = await runTransaction<unknown>("readonly", (store) =>
    store.get(cacheKey),
  );
  if (
    !isRecord(value) ||
    !isLookupRecords(value.records) ||
    typeof value.updatedAt !== "string"
  )
    return null;
  return { cacheKey, records: value.records, updatedAt: value.updatedAt };
}
export async function saveLookupCache(
  cacheKey: string,
  records: LookupRecord[],
): Promise<void> {
  if (!isLookupRecords(records))
    throw new TypeError("Invalid lookup cache records.");
  await runTransaction("readwrite", (store) =>
    store.put({ cacheKey, records, updatedAt: new Date().toISOString() }),
  );
}
