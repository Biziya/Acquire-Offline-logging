import { useMemo, useState } from "react";
import DatabaseViewerTable from "./DatabaseViewerTable";
import { databaseViewerConfig } from "./config";
import { generateMockLithologyRecords } from "./databaseViewerMockData";
import type { LithologyRecord } from "./databaseViewerTypes";
import {
  FIELD,
  FIELD_CONTROL,
  FIELD_LABEL,
  READONLY_VALUE,
} from "../../components/fieldStyles";

const { title, mockData } = databaseViewerConfig;

const BUTTON =
  "h-[30px] cursor-pointer rounded-md border border-rl-border-strong bg-white px-3 text-[0.8rem] font-[550] text-rl-navy transition-[background-color,border-color,color] duration-140 hover:border-rl-navy hover:bg-rl-navy-soft hover:text-rl-navy-dark focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring active:translate-y-px";

const numberFormat = new Intl.NumberFormat("en-US");

interface DrillholeGroup {
  project: string;
  campaign: string;
  records: LithologyRecord[];
}

/*
 * Records grouped by drillhole, each group ordered by Litho From. Built once
 * per dataset, so choosing a drillhole is a map lookup, not a scan. Project and
 * Campaign come from the drillhole's own records, so they never change for a
 * drillhole.
 */
function groupByDrillhole(records: readonly LithologyRecord[]) {
  const groups = new Map<string, DrillholeGroup>();

  records.forEach((record) => {
    const group = groups.get(record.drillhole);
    if (group) group.records.push(record);
    else
      groups.set(record.drillhole, {
        project: record.project,
        campaign: record.campaign,
        records: [record],
      });
  });

  groups.forEach((group) =>
    group.records.sort((first, second) => first.lithoFrom - second.lithoFrom),
  );

  return groups;
}

/*
 * Read-only view of lithology records. MOCK DATA ONLY for now: the records
 * are generated in the browser and nothing is requested from the backend.
 * State is local to the page; it shares nothing with Raw Litho.
 */
function DatabaseViewer() {
  const [size, setSize] = useState(mockData.defaultSize);
  const [seed, setSeed] = useState(1);
  const [drillhole, setDrillhole] = useState("");

  // Generated and grouped only when the size or seed changes (Refresh).
  const groups = useMemo(
    () => groupByDrillhole(generateMockLithologyRecords(size, seed, mockData)),
    [size, seed],
  );
  const drillholes = useMemo(
    () => Array.from(groups.keys()).sort((a, b) => a.localeCompare(b)),
    [groups],
  );

  const selected = groups.get(drillhole);
  const records = selected?.records ?? [];

  return (
    <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h1 className="m-0 text-[1.3rem] font-[650] tracking-[-0.01em] text-rl-navy">
          {title}
        </h1>

        <p
          className="m-0 rounded-md border border-[#e8c27a] bg-[#fff8e8] px-2.5 py-1 text-[0.78rem] font-semibold text-[#7a4b00]"
          role="note"
        >
          Mock data — generated in the browser, not read from the database
        </p>
      </div>

      <div className="mb-2 flex flex-wrap items-end gap-3">
        <label className={FIELD}>
          <span className={FIELD_LABEL}>Drillhole</span>
          <select
            className={`${FIELD_CONTROL} w-[190px] max-w-full px-2.5`}
            value={drillhole}
            onChange={(event) => setDrillhole(event.target.value)}
          >
            <option value="">Select drillhole</option>
            {drillholes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <div className={FIELD}>
          <span className={FIELD_LABEL}>Project</span>
          <output className={READONLY_VALUE} aria-label="Project">
            {selected?.project || "—"}
          </output>
        </div>

        <div className={FIELD}>
          <span className={FIELD_LABEL}>Campaign</span>
          <output className={READONLY_VALUE} aria-label="Campaign">
            {selected?.campaign || "—"}
          </output>
        </div>

        <label className={`${FIELD} ml-auto`}>
          <span className={FIELD_LABEL}>Mock records</span>
          <select
            className={`${FIELD_CONTROL} px-2.5`}
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          >
            {mockData.sizes.map((value) => (
              <option key={value} value={value}>
                {numberFormat.format(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[0.85rem] font-semibold text-rl-text">
          Dataset Records
        </h2>
        <p className="m-0 text-[0.8rem] text-rl-text-muted" aria-live="polite">
          {selected
            ? `${numberFormat.format(records.length)} records`
            : "No drillhole selected"}
        </p>
        <button
          className={`${BUTTON} h-7`}
          type="button"
          onClick={() => setSeed((current) => current + 1)}
          title="Generate a new set of mock records (no request is sent)"
        >
          Refresh
        </button>
      </div>

      <DatabaseViewerTable
        // A new drillhole starts at the top of its records.
        key={drillhole}
        records={records}
        emptyMessage={
          selected
            ? "This drillhole has no records."
            : "Select a drillhole to view its records."
        }
      />
    </section>
  );
}

export default DatabaseViewer;
