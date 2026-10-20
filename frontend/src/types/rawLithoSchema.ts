// The persisted field contract includes every visible and intentionally hidden field.
// Keep this module independent of React, document operations and storage.
export type RowField =
  | "extractionType"
  | "corePass"
  | "recoveryStart"
  | "recoveryEnd"
  | "coreEnd"
  | "lithoFrom"
  | "lithoTo"
  | "lithoCode"
  | "colorCode"
  | "ca"
  | "om"
  | "omFacies"
  | "py"
  | "ox"
  | "sedim"
  | "redoxCode"
  | "granulo"
  | "hardness"
  | "lithologyComments"
  | "lithologicalDescription";

export interface ColumnDefinition<Key extends RowField = RowField> {
  key: Key;
  label: string;
  type: "text" | "number";
  defaultValue: string;
}

export type ColumnSchema = { [Key in RowField]: ColumnDefinition<Key> };
export type RawLithoRow = { id: string | number } & Record<RowField, string>;

// Mapped keys enforce completeness, reject typos and require key/property agreement.
// A new persisted field cannot omit its definition or its default value.
export const columnByKey = {
  extractionType: {
    key: "extractionType",
    label: "Extraction Type",
    type: "text",
    defaultValue: "",
  },
  corePass: {
    key: "corePass",
    label: "Core Pass #",
    type: "number",
    defaultValue: "",
  },
  recoveryStart: {
    key: "recoveryStart",
    label: "Recovery Start",
    type: "number",
    defaultValue: "",
  },
  recoveryEnd: {
    key: "recoveryEnd",
    label: "Recovery End",
    type: "number",
    defaultValue: "",
  },
  coreEnd: {
    key: "coreEnd",
    label: "Core End",
    type: "number",
    defaultValue: "",
  },
  lithoFrom: {
    key: "lithoFrom",
    label: "Litho From (m)",
    type: "number",
    defaultValue: "",
  },
  lithoTo: {
    key: "lithoTo",
    label: "Litho To (m)",
    type: "number",
    defaultValue: "",
  },
  lithoCode: {
    key: "lithoCode",
    label: "Litho Code",
    type: "text",
    defaultValue: "",
  },
  colorCode: {
    key: "colorCode",
    label: "Color Code",
    type: "text",
    defaultValue: "",
  },
  ca: {
    key: "ca",
    label: "CA",
    type: "text",
    defaultValue: "",
  },
  om: {
    key: "om",
    label: "OM",
    type: "text",
    defaultValue: "",
  },
  omFacies: {
    key: "omFacies",
    label: "OM Facies",
    type: "text",
    defaultValue: "",
  },
  py: {
    key: "py",
    label: "PY",
    type: "text",
    defaultValue: "",
  },
  ox: {
    key: "ox",
    label: "OX",
    type: "text",
    defaultValue: "",
  },
  sedim: {
    key: "sedim",
    label: "Sedim",
    type: "text",
    defaultValue: "",
  },
  redoxCode: {
    key: "redoxCode",
    label: "Redox Code",
    type: "text",
    defaultValue: "",
  },
  granulo: {
    key: "granulo",
    label: "Granulo",
    type: "text",
    defaultValue: "",
  },
  hardness: {
    key: "hardness",
    label: "Hardness",
    type: "text",
    defaultValue: "",
  },
  lithologyComments: {
    key: "lithologyComments",
    label: "Lithology Comments",
    type: "text",
    defaultValue: "",
  },
  lithologicalDescription: {
    key: "lithologicalDescription",
    label: "Lithological Description",
    type: "text",
    defaultValue: "",
  },
} satisfies ColumnSchema;

export const columns: readonly ColumnDefinition[] = Object.values(columnByKey);

function hasCompleteRowFields(value: unknown): value is RawLithoRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (
    !("id" in value) ||
    (typeof value.id !== "string" && typeof value.id !== "number")
  ) {
    return false;
  }
  return columns.every(
    ({ key }) =>
      Object.hasOwn(value, key) && typeof Reflect.get(value, key) === "string",
  );
}

export function createSchemaRow(id: string | number): RawLithoRow {
  // Object.fromEntries loses the finite key set. Validate the constructed shape
  // instead of asserting it or duplicating a second, handwritten defaults object.
  const row: unknown = Object.fromEntries([
    ["id", id],
    ...columns.map(({ key, defaultValue }) => [key, defaultValue]),
  ]);
  if (!hasCompleteRowFields(row)) throw new Error("Incomplete Raw Litho row schema.");
  return row;
}
