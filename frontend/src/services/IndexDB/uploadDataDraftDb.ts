import { isRecord } from "../../types/validation";

/*
 * Upload Data's working document, kept so a loaded JSON file and its edits
 * survive navigating away and refreshing.
 *
 * Deliberately its own database rather than a store in `raw-litho-db`: the two
 * pages are maintained independently, and adding a store there would mean a
 * Raw Litho schema upgrade. One draft at a time, under a fixed key.
 */

const DATABASE_NAME = "upload-data-db";
const DATABASE_VERSION = 1;
const DRAFT_STORE = "drafts";
const DRAFT_KEY = "current";

export interface UploadDataDraft {
  fileName: string;
  /* Size of the original file in bytes. */
  fileSize: number;
  isEdited: boolean;
  /* The parsed working document, stored as-is (structured clone, no JSON). */
  document: Record<string, unknown>;
  savedAt: string;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE))
        request.result.createObjectStore(DRAFT_STORE);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("The Upload Data database upgrade is blocked."));
    request.onsuccess = () => {
      const database = request.result;

      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE, mode);
      let request: IDBRequest<T>;
      try {
        request = operation(transaction.objectStore(DRAFT_STORE));
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
  } finally {
    database.close();
  }
}

// Writes and deletes run in call order, so a Cancel issued while a save is
// still in flight always wins.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const write = writeQueue.then(operation);
  writeQueue = write.catch(() => undefined);
  return write;
}

function isDraft(value: unknown): value is UploadDataDraft {
  return (
    isRecord(value) &&
    typeof value.fileName === "string" &&
    typeof value.fileSize === "number" &&
    typeof value.isEdited === "boolean" &&
    isRecord(value.document)
  );
}

export async function readUploadDataDraft(): Promise<UploadDataDraft | null> {
  // Wait for queued writes so a quick return to the page reads the latest one.
  await writeQueue;
  const value = await runTransaction<unknown>("readonly", (store) =>
    store.get(DRAFT_KEY),
  );
  return isDraft(value) ? value : null;
}

export function writeUploadDataDraft(draft: UploadDataDraft): Promise<void> {
  return enqueue(async () => {
    await runTransaction("readwrite", (store) => store.put(draft, DRAFT_KEY));
  });
}

export function clearUploadDataDraft(): Promise<void> {
  return enqueue(async () => {
    await runTransaction("readwrite", (store) => store.delete(DRAFT_KEY));
  });
}
