import type { RowId } from "../types/domain";
import { isRecord } from "../types/validation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  readRawExtractionDraft,
  writeRawExtractionDraft,
} from "../services/IndexDB/rawExtractionDraftDb";
import "../css/RawExtraction.css";

type ExtractionField =
  | "extractionType"
  | "coringMethod"
  | "corePass"
  | "startDepth"
  | "endDepth"
  | "recovered"
  | "recovery"
  | "mudLayer"
  | "mudImp";
type ExtractionRow = { id: RowId } & Record<ExtractionField, string>;
interface StoredExtractionDraft {
  project: string;
  campaign: string;
  drillhole: string;
  rows: unknown[];
}




const dropdowns: {
  id: "project" | "campaign" | "drillholes";
  label: string;
  placeholder: string;
}[] = [
  { id: "project", label: "Project", placeholder: "Select Project" },
  { id: "campaign", label: "Campaign", placeholder: "Select Campaign" },
  { id: "drillholes", label: "Drillholes", placeholder: "Select Drillhole" },
];

const columns: { key: ExtractionField; label: string; type: string }[] = [
  { key: "extractionType", label: "Extraction Type", type: "text" },
  { key: "coringMethod", label: "Coring Method", type: "text" },
  { key: "corePass", label: "Core Pass #", type: "number" },
  { key: "startDepth", label: "Start Depth", type: "number" },
  { key: "endDepth", label: "End Depth", type: "number" },
  { key: "recovered", label: "Recovered (Mts)", type: "number" },
  { key: "recovery", label: "Recovery (%)", type: "number" },
  { key: "mudLayer", label: "Mud Layer (%)", type: "number" },
  { key: "mudImp", label: "Mud Imp (%)", type: "number" },
];

const rowFieldMap: Record<string, ExtractionField> = {
  extractionType: "extractionType",
  coringMethod: "coringMethod",
  corePass: "corePass",
  startDepth: "startDepth",
  endDepth: "endDepth",
  recoveredMts: "recovered",
  recoveryPercent: "recovery",
  mudLayerPercent: "mudLayer",
  mudImpPercent: "mudImp",
};

function createEmptyRow(rowId: RowId): ExtractionRow {
  return {
    id: rowId,
    extractionType: "",
    coringMethod: "",
    corePass: "",
    startDepth: "",
    endDepth: "",
    recovered: "",
    recovery: "",
    mudLayer: "",
    mudImp: "",
  };
}

function isValidDraft(draft: unknown): draft is StoredExtractionDraft {
  return (
    isRecord(draft) &&
    typeof draft.project === "string" &&
    typeof draft.campaign === "string" &&
    typeof draft.drillhole === "string" &&
    Array.isArray(draft.rows)
  );
}

function isValidRowId(id: unknown): id is RowId {
  return (
    (typeof id === "string" && id.trim() !== "") ||
    (typeof id === "number" && Number.isInteger(id) && id >= 1)
  );
}

function createRowId(usedIds: Set<string>) {
  let id;

  do {
    id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } while (usedIds.has(String(id)));

  return id;
}

function restoreRows(savedRows: unknown[]): ExtractionRow[] {
  const usedIds = new Set<string>();
  return savedRows.filter(isRecord).map((source) => {
    const id =
      isValidRowId(source.id) && !usedIds.has(String(source.id))
        ? source.id
        : createRowId(usedIds);
    usedIds.add(String(id));
    const row = createEmptyRow(id);
    for (const [draftKey, stateKey] of Object.entries(rowFieldMap)) {
      const value = source[draftKey];
      row[stateKey] =
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : "";
    }
    return row;
  });
}

function buildDraft(
  project: string,
  campaign: string,
  drillhole: string,
  rows: ExtractionRow[],
) {
  return {
    project: project ?? "",
    campaign: campaign ?? "",
    drillhole: drillhole ?? "",
    rows: rows.map((row) => ({
      id: row.id,
      extractionType: row.extractionType ?? "",
      coringMethod: row.coringMethod ?? "",
      corePass: row.corePass ?? "",
      startDepth: row.startDepth ?? "",
      endDepth: row.endDepth ?? "",
      recoveredMts: row.recovered ?? "",
      recoveryPercent: row.recovery ?? "",
      mudLayerPercent: row.mudLayer ?? "",
      mudImpPercent: row.mudImp ?? "",
    })),
  };
}

function createExportFilename(drillhole: string) {
  return `${drillhole}.json`;
}

function exportDraft(draft: StoredExtractionDraft) {
  const json = JSON.stringify(draft, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = objectUrl;
  downloadLink.download = createExportFilename(draft.drillhole);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(objectUrl);
}

function RawExtraction() {
  const [project, setProject] = useState("");
  const [campaign, setCampaign] = useState("");
  const [drillhole, setDrillhole] = useState("");
  const [rows, setRows] = useState<ExtractionRow[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const nextRowId = useRef(1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const currentDraft = useCallback(
    () => buildDraft(project, campaign, drillhole, rows),
    [project, campaign, drillhole, rows],
  );

  useEffect(() => {
    mounted.current = true;

    async function restoreDraft() {
      try {
        const savedDraft = await readRawExtractionDraft();

        if (savedDraft !== undefined) {
          if (!isValidDraft(savedDraft)) {
            console.error(
              "Raw Extraction draft restoration skipped: invalid draft structure.",
            );
          } else if (mounted.current) {
            const restoredRows = restoreRows(savedDraft.rows);

            setProject(savedDraft.project ?? "");
            setCampaign(savedDraft.campaign ?? "");
            setDrillhole(savedDraft.drillhole ?? "");
            setRows(restoredRows);

            const numericIds = restoredRows
              .map((row) => row.id)
              .filter(
                (id): id is number =>
                  typeof id === "number" && Number.isInteger(id) && id >= 1,
              );

            nextRowId.current =
              numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
          }
        }
      } catch (error) {
        console.error("Failed to restore the Raw Extraction draft.", error);
      } finally {
        if (mounted.current) {
          setDraftReady(true);
        }
      }
    }

    restoreDraft();

    return () => {
      mounted.current = false;

      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!draftReady) {
      return undefined;
    }

    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
    }

    const draft = currentDraft();

    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      writeRawExtractionDraft(draft).catch((error) => {
        console.error("Failed to auto-save the Raw Extraction draft.", error);
      });
    }, 400);

    return () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [currentDraft, draftReady]);

  const addRow = () => {
    const usedIds = new Set(rows.map((row) => String(row.id)));
    let rowId = nextRowId.current;

    while (usedIds.has(String(rowId))) {
      rowId += 1;
    }

    nextRowId.current = rowId + 1;
    setRows((currentRows) => [...currentRows, createEmptyRow(rowId)]);
  };

  const updateRow = (
    rowId: RowId,
    fieldKey: ExtractionField,
    newValue: string,
  ) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId ? { ...row, [fieldKey]: newValue } : row,
      ),
    );
  };

  const dropdownValues = {
    project,
    campaign,
    drillholes: drillhole,
  };

  const handleDropdownChange = (id: string, value: string) => {
    if (id === "project") {
      setProject(value);
    } else if (id === "campaign") {
      setCampaign(value);
    } else {
      setDrillhole(value);
    }
  };

  const handleSave = async () => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const draft = currentDraft();

    try {
      await writeRawExtractionDraft(draft);
    } catch (error) {
      console.error("Failed to save the Raw Extraction draft.", error);
    }

    exportDraft(draft);
  };

  return (
    <section className="raw-extraction-page">
      <h1 className="raw-extraction-title">Raw Extraction</h1>

      <div className="raw-extraction-controls">
        {dropdowns.map(({ id, label, placeholder }) => {
          const value = dropdownValues[id];

          return (
            <div className="raw-extraction-field" key={id}>
              <label className="raw-extraction-label" htmlFor={id}>
                {label}
              </label>

              <select
                className="raw-extraction-select"
                id={id}
                name={id}
                value={value}
                onChange={(event) =>
                  handleDropdownChange(id, event.target.value)
                }
              >
                <option value="" disabled>
                  {placeholder}
                </option>

                {value !== "" && <option value={value}>{value}</option>}
              </select>
            </div>
          );
        })}

        <button
          className="raw-extraction-refresh"
          type="button"
          aria-label="Refresh Raw Extraction data"
        >
          Refresh
        </button>
      </div>

      <div className="raw-extraction-table-section">
        <div className="raw-extraction-table-scroll">
          <table className="raw-extraction-table">
            <thead>
              <tr>
                <th scope="col">Upd</th>

                {columns.map(({ key, label }) => (
                  <th scope="col" key={key}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>

                  {columns.map(({ key, label, type }) => (
                    <td key={key}>
                      <input
                        className="raw-extraction-input"
                        name={`${key}-${row.id}`}
                        type={type}
                        step={type === "number" ? "any" : undefined}
                        value={row[key]}
                        onChange={(event) =>
                          updateRow(row.id, key, event.target.value)
                        }
                        aria-label={`${label} for row ${index + 1}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          className="raw-extraction-add-row"
          type="button"
          onClick={addRow}
          aria-label="Add row"
        >
          <span className="raw-extraction-add-icon" aria-hidden="true">
            +
          </span>
        </button>
      </div>

      <div className="raw-extraction-save-section">
        <button
          className="raw-extraction-save-button"
          type="button"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </section>
  );
}

export default RawExtraction;
