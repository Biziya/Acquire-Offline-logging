import { createConfigReader } from "../../config/yamlConfig";
import configText from "./config.yaml?raw";

/* Typed copy of config.yaml, parsed and validated once at module load. */
export function readRawExtractionConfig(text: string) {
  const reader = createConfigReader(text, "RawExtraction/config.yaml");
  const table = reader.section(reader.root.table, "table");

  return {
    title: reader.string(reader.root.title, "title"),
    overscan: reader.integer(table.overscan, "table.overscan", 0),
  };
}

export const rawExtractionConfig = readRawExtractionConfig(configText);
