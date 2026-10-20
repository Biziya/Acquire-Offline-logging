import type { RowField } from "../../types/domain";
import { columns as schemaColumns } from "../../types/rawLithoSchema";
import { createConfigReader } from "../../config/yamlConfig";
import configText from "./config.yaml?raw";

/* Typed copy of config.yaml, parsed and validated once at module load. */
export function readRawLithoConfig(text: string) {
  const reader = createConfigReader(text, "RawLitho/config.yaml");
  const table = reader.section(reader.root.table, "table");
  const fieldKeys = schemaColumns.map(({ key }) => key);
  const columns = reader.columns<RowField>(
    table.columns,
    "table.columns",
    fieldKeys,
  );

  // Hidden fields are listed too, so a column can never disappear from the
  // configuration by accident.
  const missing = fieldKeys.filter(
    (key) => !columns.some((column) => column.key === key),
  );
  if (missing.length > 0)
    reader.fail("table.columns", `is missing ${missing.join(", ")}.`);

  return {
    title: reader.string(reader.root.title, "title"),
    rowsPerPage: reader.integer(table.rowsPerPage, "table.rowsPerPage"),
    rowHeight: reader.integer(table.rowHeight, "table.rowHeight"),
    minWidth: reader.integer(table.minWidth, "table.minWidth"),
    indexColumnWidth: reader.integer(
      table.indexColumnWidth,
      "table.indexColumnWidth",
    ),
    columns,
  };
}

export const rawLithoConfig = readRawLithoConfig(configText);
