const DATABASE_NAME = "raw-extraction-db";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const DRAFT_KEY = "current";

let writeQueue = Promise.resolve();

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readRawExtractionDraft() {
  const database = await openDatabase();

  return new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(DRAFT_KEY);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => database.close();
  });
}

function performWrite(draft: unknown) {
  return openDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");

        transaction.objectStore(STORE_NAME).put(draft, DRAFT_KEY);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          const error = transaction.error;
          database.close();
          reject(error);
        };
        transaction.onabort = () => {
          const error = transaction.error;
          database.close();
          reject(error);
        };
      }),
  );
}

export function writeRawExtractionDraft(draft: unknown) {
  const write = writeQueue.then(() => performWrite(draft));

  writeQueue = write.catch(() => {});
  return write;
}
