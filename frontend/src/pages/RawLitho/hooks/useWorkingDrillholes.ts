import { useEffect, useMemo, useRef, useState } from "react";
import type { RawLithoDocument } from "../../../types/domain";
import { isRecord } from "../../../types/validation";
import { readRawLithoDrafts } from "../../../services/IndexDB/rawLithoDraftDb";
import { hasWorkingData } from "../drillholeOrdering";

function modifiedAtOf(draft: unknown) {
  return isRecord(draft) && typeof draft.modified_at === "string" ? draft.modified_at : "";
}

/*
 * The drillholes with saved Raw Litho working data, each with its draft's
 * `modified_at`. Read once from IndexedDB when the page opens (read-only;
 * drafts are never changed here), then kept current from the open document:
 * once it has loaded, a drillhole joins as soon as its document holds data
 * (autosave writes it within moments) and leaves if every value is cleared.
 * Other drafts cannot change while the page is open, so they are not re-read
 * on each edit.
 */
export function useWorkingDrillholes(lithoDocument: RawLithoDocument, isLoaded: boolean) {
  const [workingDrafts, setWorkingDrafts] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  // What this session has seen of the open drillholes (null: no data). It is
  // newer than the stored read, which may resolve after it.
  const seen = useRef(new Map<string, string | null>());

  useEffect(() => {
    let isActive = true;

    readRawLithoDrafts()
      .then((drafts) => {
        if (!isActive) return;

        const next = new Map<string, string>();
        drafts.forEach(({ draftKey, draft }) => {
          if (hasWorkingData(draft)) next.set(draftKey, modifiedAtOf(draft));
        });
        seen.current.forEach((modifiedAt, holeId) => {
          if (modifiedAt === null) next.delete(holeId);
          else next.set(holeId, modifiedAt);
        });
        setWorkingDrafts(next);
      })
      .catch((error) => console.error("Unable to read the Raw Litho drafts.", error));

    return () => {
      isActive = false;
    };
  }, []);

  const holeId = isLoaded ? lithoDocument.drillhole : "";
  const hasData = useMemo(
    () => isLoaded && hasWorkingData(lithoDocument),
    [isLoaded, lithoDocument],
  );
  const modifiedAt = lithoDocument.modified_at;

  useEffect(() => {
    if (!holeId) return;

    seen.current.set(holeId, hasData ? modifiedAt : null);
    setWorkingDrafts((current) => {
      if (hasData === current.has(holeId)) return current;

      const next = new Map(current);
      if (hasData) next.set(holeId, modifiedAt);
      else next.delete(holeId);
      return next;
    });
    // `modifiedAt` changes with every edit; only joining or leaving matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeId, hasData]);

  return workingDrafts;
}
