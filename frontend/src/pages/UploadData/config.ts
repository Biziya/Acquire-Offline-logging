import { createConfigReader } from "../../config/yamlConfig";
import configText from "./config.yaml?raw";

/* Typed copy of config.yaml, parsed and validated once at module load. */
export function readUploadDataConfig(text: string) {
  const reader = createConfigReader(text, "UploadData/config.yaml");
  const table = reader.section(reader.root.table, "table");
  const search = reader.section(reader.root.search, "search");
  const draft = reader.section(reader.root.draft, "draft");
  const maxHeightVh = reader.integer(table.maxHeightVh, "table.maxHeightVh");
  if (maxHeightVh > 100)
    reader.fail("table.maxHeightVh", "must be at most 100 (percent).");

  return {
    title: reader.string(reader.root.title, "title"),
    overscan: reader.integer(table.overscan, "table.overscan", 0),
    maxHeightVh,
    statusColumnWidth: reader.integer(
      table.statusColumnWidth,
      "table.statusColumnWidth",
    ),
    searchDebounceMs: reader.integer(
      search.debounceMs,
      "search.debounceMs",
      0,
    ),
    draftSaveDebounceMs: reader.integer(
      draft.saveDebounceMs,
      "draft.saveDebounceMs",
      0,
    ),
  };
}

export const uploadDataConfig = readUploadDataConfig(configText);
