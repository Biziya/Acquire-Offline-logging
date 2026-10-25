import { useEffect, useRef, useState } from "react";
import type { Drillhole, Notify } from "../../types/domain";
import { isAbortError } from "../../types/validation";
import { getDataViewerDrillholes } from "../../services/Api/dataViewerApi";

const LOAD_ERROR = "Drillhole list unavailable";

/*
 * Kept for the browser session, like the page state: returning to the page
 * shows the last list at once while a fresh one (new uploads) is fetched.
 */
let cachedDrillholes: Drillhole[] | null = null;

/*
 * The drillholes that have records in MyApps.CoreDescrData
 * (GET /api/dataviewer/drillholes), sorted by the database. Not Raw Litho's
 * list: a drillhole without stored records is not offered here. Project and
 * Campaign come with each drillhole's records, so they are empty here.
 */
export function useDataViewerDrillholes(showToast: Notify) {
  const [drillholes, setDrillholes] = useState(() => cachedDrillholes ?? []);
  const [isLoading, setIsLoading] = useState(cachedDrillholes === null);
  const [error, setError] = useState("");

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    const controller = new AbortController();

    getDataViewerDrillholes(controller.signal)
      .then((holeIds) => {
        cachedDrillholes = holeIds.map((holeId) => ({ holeId, projectCode: "", campaign: "" }));
        setDrillholes(cachedDrillholes);
        setError("");
      })
      .catch((loadError) => {
        if (isAbortError(loadError)) return;

        console.error("Unable to load the Data Viewer drillholes.", loadError);
        // A list already shown stays usable; only a first load fails visibly.
        if (cachedDrillholes) return;
        setError(LOAD_ERROR);
        showToastRef.current({ type: "error", message: "Unable to load drillholes" });
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  return { drillholes, isLoading, error };
}

/* Tests only: forget the session's list. */
export function resetDataViewerDrillholes() {
  cachedDrillholes = null;
}
