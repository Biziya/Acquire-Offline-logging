/*
 * Single owner of the `raw-litho-db` connection and schema.
 *
 * Every module that touches this database goes through `runTransaction` so the
 * version number and the store list are declared in exactly one place.
 */

const DATABASE_NAME = "raw-litho-db";
const DATABASE_VERSION = 4;

export const DRAFT_STORE = "drafts";
export const DRILLHOLE_CACHE_STORE = "drillholeCache";
export const LOOKUP_CACHE_STORE = "rawLithoLookupCache";
export const SESSION_STORE = "session";

const STORE_NAMES = [
  DRAFT_STORE,
  DRILLHOLE_CACHE_STORE,
  LOOKUP_CACHE_STORE,
  SESSION_STORE,
];

function createMissingStores(database: IDBDatabase) {
  const missingStores = STORE_NAMES.filter(
    (storeName) => !database.objectStoreNames.contains(storeName),
  );

  missingStores.forEach((storeName) => database.createObjectStore(storeName));
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => createMissingStores(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("The Raw Litho database upgrade is blocked."));
    request.onsuccess = () => {
      const database = request.result;

      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

type StoreOperation<T> = (store: IDBObjectStore) => IDBRequest<T>;
function awaitTransaction<T>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  operation: StoreOperation<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let request: IDBRequest<T>;
    try {
      request = operation(transaction.objectStore(storeName));
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    request.onerror = () => reject(request.error);
    // A successful request is not yet a committed transaction.
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Transaction aborted."));
  });
}
export async function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: StoreOperation<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await awaitTransaction(database, storeName, mode, operation);
  } finally {
    database.close();
  }
}
export function readValue(
  storeName: string,
  key: IDBValidKey,
): Promise<unknown> {
  return runTransaction<unknown>(storeName, "readonly", (store) =>
    store.get(key),
  );
}
// Serialize writes in invocation order, including database-open latency.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const write = writeQueue.then(operation);
  writeQueue = write.catch(() => undefined);
  return write;
}
export function writeValue(
  storeName: string,
  key: IDBValidKey,
  value: unknown,
): Promise<void> {
  return enqueue(async () => {
    await runTransaction(storeName, "readwrite", (store) =>
      store.put(value, key),
    );
  });
}
export function deleteValue(
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  return enqueue(async () => {
    await runTransaction(storeName, "readwrite", (store) => store.delete(key));
  });
}
