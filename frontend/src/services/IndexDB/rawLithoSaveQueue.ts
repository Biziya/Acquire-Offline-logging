import type { RawLithoDocument } from "../../types/domain";
import { writeRawLithoDraft } from "./rawLithoDraftDb";

export type ImportWriteOutcome =
  | { status: "completed" }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export interface ImportWriteOptions {
  signal?: AbortSignal;
  onWriteStarted?: () => void;
}

/** Pending edit snapshots survive route unmounts. Failed writes retain them. */
export class DraftSaveQueue {
  private pending = new Map<string, RawLithoDocument>();
  private running = new Map<string, Promise<boolean>>();
  private revisions = new Map<string, number>();

  constructor(
    private readonly write: (key: string, draft: RawLithoDocument) => Promise<void>,
  ) {}

  stage(key: string, draft: RawLithoDocument): void {
    this.pending.set(key, draft);
    this.revisions.set(key, this.revision(key) + 1);
  }

  peek(key: string): RawLithoDocument | undefined {
    return this.pending.get(key);
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }

  flush(key: string): Promise<boolean> {
    const running = this.running.get(key);
    if (running) return running;

    const task = this.drain(key).finally(() => {
      // An import may have installed a successor while this save was running.
      if (this.running.get(key) === task) this.running.delete(key);
    });
    this.running.set(key, task);
    return task;
  }

  private revision(key: string): number {
    return this.revisions.get(key) ?? 0;
  }

  private async drain(key: string): Promise<boolean> {
    while (this.pending.has(key)) {
      const snapshot = this.pending.get(key);
      if (!snapshot) break;
      try {
        await this.write(key, snapshot);
      } catch {
        return false;
      }
      // A newer edit can arrive while the old snapshot is writing. Only remove
      // the snapshot that committed; leave a newer one for the next iteration.
      if (this.pending.get(key) === snapshot) this.pending.delete(key);
    }
    return true;
  }

  /**
   * An import is a one-shot replacement, never an autosave snapshot. This keeps
   * failed/cancelled imports out of peek(), restoration and background retries.
   * Earlier edits must commit first. New edits while waiting require confirmation
   * again, so an old import cannot silently replace changes it did not describe.
   */
  commitImport(
    key: string,
    draft: RawLithoDocument,
    options: ImportWriteOptions = {},
  ): Promise<ImportWriteOutcome> {
    const revision = this.revision(key);
    const previous = this.running.get(key);
    const outcome = this.performImport(key, draft, revision, previous, options);
    const task = outcome
      .then(() => !this.pending.has(key))
      .finally(() => {
        if (this.running.get(key) === task) this.running.delete(key);
      });
    this.running.set(key, task);
    // Resolve the caller only after removing this ordering barrier, so an
    // immediate explicit retry starts fresh rather than reusing its old result.
    return task.then(() => outcome);
  }

  private async performImport(
    key: string,
    draft: RawLithoDocument,
    revision: number,
    previous: Promise<boolean> | undefined,
    { signal, onWriteStarted }: ImportWriteOptions,
  ): Promise<ImportWriteOutcome> {
    // Yield before work so commitImport installs its ordering barrier first.
    await previous;
    if (signal?.aborted) return { status: "cancelled" };

    if (!(await this.drain(key))) {
      return {
        status: "failed",
        message: "Earlier edits could not be saved. Import was not applied.",
      };
    }
    if (signal?.aborted) return { status: "cancelled" };
    if (this.revision(key) !== revision) {
      return {
        status: "failed",
        message: "The draft changed. Review it before importing again.",
      };
    }

    // Cancellation ends here: once submitted, the IndexedDB write may commit.
    // No cancellation response is returned after this boundary.
    try {
      onWriteStarted?.();
      await this.write(key, draft);
    } catch {
      return {
        status: "failed",
        message: "Import was not saved. Retry or cancel.",
      };
    }
    this.revisions.set(key, this.revision(key) + 1);

    // Edits staged during the import remain newer. Drain them in order; a
    // failure keeps them pending without misreporting the committed import.
    await this.drain(key);
    return { status: "completed" };
  }

  async flushAll(): Promise<boolean> {
    const results = await Promise.all(
      [...this.pending.keys()].map((key) => this.flush(key)),
    );
    return results.every(Boolean);
  }
}

export const rawLithoSaveQueue = new DraftSaveQueue(writeRawLithoDraft);
