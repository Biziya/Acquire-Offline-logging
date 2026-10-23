import { createConfigReader } from "../../config/yamlConfig";
import configText from "./config.yaml?raw";

/*
 * Typed copy of config.yaml, parsed and validated once at module load. Row
 * height and index-column width come from Raw Litho's configuration (see
 * DatabaseViewerTable).
 */
export function readDatabaseViewerConfig(text: string) {
  const reader = createConfigReader(text, "DatabaseViewer/config.yaml");
  const table = reader.section(reader.root.table, "table");

  return {
    title: reader.string(reader.root.title, "title"),
    overscan: reader.integer(table.overscan, "table.overscan", 0),
    minWidth: reader.integer(table.minWidth, "table.minWidth"),
  };
}

export const databaseViewerConfig = readDatabaseViewerConfig(configText);
