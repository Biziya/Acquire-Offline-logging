import { createConfigReader } from "../../config/yamlConfig";
import configText from "./config.yaml?raw";

/*
 * Typed copy of config.yaml, parsed and validated once at module load. Table
 * appearance comes from Raw Litho's configuration (see DatabaseViewerTable).
 */
export function readDatabaseViewerConfig(text: string) {
  const reader = createConfigReader(text, "DatabaseViewer/config.yaml");
  const table = reader.section(reader.root.table, "table");
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
    overscan: reader.integer(table.overscan, "table.overscan", 0),
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
