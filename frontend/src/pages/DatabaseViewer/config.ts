import { createConfigReader } from "../../config/yamlConfig";
import { LITHOLOGY_COLUMN_KEYS } from "./databaseViewerTypes";
import configText from "./config.yaml?raw";

/* Typed copy of config.yaml, parsed and validated once at module load. */
export function readDatabaseViewerConfig(text: string) {
  const reader = createConfigReader(text, "DatabaseViewer/config.yaml");
  const table = reader.section(reader.root.table, "table");
  const search = reader.section(reader.root.search, "search");
  const mock = reader.section(reader.root.mockData, "mockData");

  const sizes = Array.isArray(mock.sizes)
    ? mock.sizes.map((size, index) =>
        reader.integer(size, `mockData.sizes[${index}]`),
      )
    : reader.fail("mockData.sizes", "must be a list of record counts.");
  const defaultSize = reader.integer(mock.defaultSize, "mockData.defaultSize");
  if (!sizes.includes(defaultSize))
    reader.fail("mockData.defaultSize", "must be one of mockData.sizes.");

  return {
    title: reader.string(reader.root.title, "title"),
    rowHeight: reader.integer(table.rowHeight, "table.rowHeight"),
    overscan: reader.integer(table.overscan, "table.overscan", 0),
    minWidth: reader.integer(table.minWidth, "table.minWidth"),
    indexColumnWidth: reader.integer(
      table.indexColumnWidth,
      "table.indexColumnWidth",
    ),
    columns: reader
      .columns(table.columns, "table.columns", LITHOLOGY_COLUMN_KEYS)
      .filter((column) => column.visible),
    searchDebounceMs: reader.integer(
      search.debounceMs,
      "search.debounceMs",
      0,
    ),
    mockData: {
      sizes,
      defaultSize,
      projects: reader.integer(mock.projects, "mockData.projects"),
      campaignsPerProject: reader.integer(
        mock.campaignsPerProject,
        "mockData.campaignsPerProject",
      ),
      drillholesPerCampaign: reader.integer(
        mock.drillholesPerCampaign,
        "mockData.drillholesPerCampaign",
      ),
    },
  };
}

export const databaseViewerConfig = readDatabaseViewerConfig(configText);
export type DatabaseViewerMockSettings = typeof databaseViewerConfig.mockData;
