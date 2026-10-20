import { useEffect, useMemo, useState } from "react";
import DatabaseViewerTable from "./DatabaseViewerTable";
import { databaseViewerConfig } from "./config";
import { generateMockLithologyRecords } from "./databaseViewerMockData";

const { title, columns, mockData, searchDebounceMs } = databaseViewerConfig;

const FIELD = "grid gap-[3px]";
const LABEL = "text-[0.75rem] font-semibold text-rl-text-muted";
const CONTROL =
  "h-[30px] rounded-md border border-rl-border-strong bg-white px-2.5 text-[0.8333rem] text-rl-text transition-[background-color,border-color,box-shadow] duration-140 hover:border-rl-navy focus:border-rl-navy focus:shadow-[0_0_0_3px_var(--color-rl-ring-glow)] focus:outline-none";
const BUTTON =
  "h-[30px] cursor-pointer rounded-md border border-rl-border-strong bg-white px-3 text-[0.8rem] font-[550] text-rl-navy transition-[background-color,border-color,color] duration-140 hover:border-rl-navy hover:bg-rl-navy-soft hover:text-rl-navy-dark focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring active:translate-y-px disabled:cursor-not-allowed disabled:border-rl-border disabled:bg-rl-navy-softer disabled:text-rl-disabled";

const numberFormat = new Intl.NumberFormat("en-US");

function uniqueSorted(values: Iterable<string>) {
  return Array.from(new Set(values)).sort((first, second) =>
    first.localeCompare(second),
  );
}

/*
 * Read-only view of lithology records. MOCK DATA ONLY for now: the records
 * are generated in the browser and nothing is requested from the backend.
 * State is local to the page; it shares nothing with Raw Litho.
 */
function DatabaseViewer() {
  const [size, setSize] = useState(mockData.defaultSize);
  const [seed, setSeed] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [campaign, setCampaign] = useState("");
  const [drillhole, setDrillhole] = useState("");

  // Generated only when the size or seed changes (Refresh), never per render.
  const records = useMemo(
    () => generateMockLithologyRecords(size, seed, mockData),
    [size, seed],
  );

  // Lower-cased text of each record's visible cells, built once per dataset
  // so a search is a single substring test per record.
  const searchText = useMemo(
    () =>
      records.map((record) =>
        columns
          .map((column) => String(record[column.key]))
          .join("\u0000")
          .toLocaleLowerCase(),
      ),
    [records],
  );

  // Filtering waits for typing to pause, so 100,000 records are not scanned
  // on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setSearch(searchInput.trim().toLocaleLowerCase()),
      searchDebounceMs,
    );
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const options = useMemo(
    () => ({
      projects: uniqueSorted(records.map((record) => record.project)),
      campaigns: uniqueSorted(
        records
          .filter((record) => !project || record.project === project)
          .map((record) => record.campaign),
      ),
      drillholes: uniqueSorted(
        records
          .filter(
            (record) =>
              (!project || record.project === project) &&
              (!campaign || record.campaign === campaign),
          )
          .map((record) => record.drillhole),
      ),
    }),
    [campaign, project, records],
  );

  const visibleRecords = useMemo(
    () =>
      records.filter(
        (record, index) =>
          (!project || record.project === project) &&
          (!campaign || record.campaign === campaign) &&
          (!drillhole || record.drillhole === drillhole) &&
          (!search || (searchText[index] ?? "").includes(search)),
      ),
    [campaign, drillhole, project, records, search, searchText],
  );

  const hasFilters = Boolean(searchInput || project || campaign || drillhole);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setProject("");
    setCampaign("");
    setDrillhole("");
  }

  return (
    <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
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
          <span className={LABEL}>Search</span>
          <input
            className={`${CONTROL} min-w-[220px]`}
            type="search"
            value={searchInput}
            placeholder="Search all columns"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <label className={FIELD}>
          <span className={LABEL}>Project</span>
          <select
            className={`${CONTROL} min-w-[150px]`}
            value={project}
            onChange={(event) => {
              setProject(event.target.value);
              setCampaign("");
              setDrillhole("");
            }}
          >
            <option value="">All projects</option>
            {options.projects.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>Campaign</span>
          <select
            className={`${CONTROL} min-w-[130px]`}
            value={campaign}
            onChange={(event) => {
              setCampaign(event.target.value);
              setDrillhole("");
            }}
          >
            <option value="">All campaigns</option>
            {options.campaigns.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>Drillhole</span>
          <select
            className={`${CONTROL} min-w-[150px]`}
            value={drillhole}
            onChange={(event) => setDrillhole(event.target.value)}
          >
            <option value="">All drillholes</option>
            {options.drillholes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <button
          className={BUTTON}
          type="button"
          onClick={clearFilters}
          disabled={!hasFilters}
        >
          Clear filters
        </button>

        <label className={`${FIELD} ml-auto`}>
          <span className={LABEL}>Mock records</span>
          <select
            className={`${CONTROL} min-w-[110px]`}
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

      <div className="mb-1.5 flex items-center gap-2.5">
        <p
          className="m-0 text-[0.8rem] font-semibold text-rl-text"
          aria-live="polite"
        >
          Showing {numberFormat.format(visibleRecords.length)} of{" "}
          {numberFormat.format(records.length)} records
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

      <DatabaseViewerTable records={visibleRecords} />
    </section>
  );
}

export default DatabaseViewer;
