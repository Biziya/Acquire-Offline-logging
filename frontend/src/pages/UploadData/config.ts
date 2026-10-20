import type { RowField } from "../../types/domain";
import { columns as schemaColumns } from "../../types/rawLithoSchema";
import { createConfigReader } from "../../config/yamlConfig";
import configText from "./config.yaml?raw";

/* Typed copy of config.yaml, parsed and validated once at module load. */
export function readUploadDataConfig(text: string) {
  const reader = createConfigReader(text, "UploadData/config.yaml");
  const table = reader.section(reader.root.table, "table");
  const search = reader.section(reader.root.search, "search");
  const maxHeightVh = reader.integer(table.maxHeightVh, "table.maxHeightVh");
  if (maxHeightVh > 100)
    reader.fail("table.maxHeightVh", "must be at most 100 (percent).");

  return {
    title: reader.string(reader.root.title, "title"),
    rowHeight: reader.integer(table.rowHeight, "table.rowHeight"),
    overscan: reader.integer(table.overscan, "table.overscan", 0),
    maxHeightVh,
    minWidth: reader.integer(table.minWidth, "table.minWidth"),
    indexColumnWidth: reader.integer(
      table.indexColumnWidth,
      "table.indexColumnWidth",
    ),
    statusColumnWidth: reader.integer(
      table.statusColumnWidth,
      "table.statusColumnWidth",
    ),
    columns: reader
      .columns<RowField>(
        table.columns,
        "table.columns",
        schemaColumns.map(({ key }) => key),
      )
      .filter((column) => column.visible),
    searchDebounceMs: reader.integer(
      search.debounceMs,
      "search.debounceMs",
      0,
    ),
  };
}

export const uploadDataConfig = readUploadDataConfig(configText);
