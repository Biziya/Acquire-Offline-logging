import { parse } from "yaml";
import { errorMessage, isRecord } from "../types/validation";

/*
 * Static UI settings live in a `config.yaml` next to each page. Vite bundles
 * the file as text (`import text from "./config.yaml?raw"`); the page's
 * `config.ts` parses it once, when the module loads, and copies every value
 * into a typed object through this reader.
 *
 * The reader is strict: a missing key, a wrong type or an out-of-range number
 * throws an Error naming the file and the key, so a broken configuration
 * fails at start-up (and in `npm test`) instead of rendering a wrong page.
 * YAML holds values only; all behaviour stays in TypeScript.
 */
export function createConfigReader(text: string, file: string) {
  function fail(path: string, message: string): never {
    throw new Error(`${file}: ${path} ${message}`);
  }

  function section(value: unknown, path: string): Record<string, unknown> {
    return isRecord(value) ? value : fail(path, "must be a mapping of keys.");
  }

  let root: unknown;
  try {
    root = parse(text);
  } catch (error) {
    throw new Error(`${file}: invalid YAML. ${errorMessage(error)}`, {
      cause: error,
    });
  }

  function string(value: unknown, path: string) {
    return typeof value === "string" && value.trim()
      ? value
      : fail(path, "must be a non-empty string.");
  }

  function boolean(value: unknown, path: string) {
    return typeof value === "boolean"
      ? value
      : fail(path, "must be true or false.");
  }

  /* A whole number of at least `min` (pixels, counts, row heights). */
  function integer(value: unknown, path: string, min = 1) {
    return typeof value === "number" && Number.isInteger(value) && value >= min
      ? value
      : fail(path, `must be a whole number of at least ${min}.`);
  }

  /*
   * A `columns:` mapping, in display order. Every key must be one of `keys`
   * (YAML itself rejects a key listed twice). A visible column needs a
   * `width`; a hidden one may omit it.
   */
  function columns<Key extends string>(
    value: unknown,
    path: string,
    keys: readonly Key[],
  ): TableColumnConfig<Key>[] {
    return Object.entries(section(value, path)).map(([key, entry]) => {
      const keyPath = `${path}.${key}`;
      if (!keys.some((allowed) => allowed === key))
        fail(keyPath, `is not a known column (${keys.join(", ")}).`);
      const column = section(entry, keyPath);
      const visible = boolean(column.visible, `${keyPath}.visible`);

      return {
        key: key as Key,
        label: string(column.label, `${keyPath}.label`),
        visible,
        width:
          column.width === undefined && !visible
            ? 0
            : integer(column.width, `${keyPath}.width`),
        compact:
          column.compact === undefined
            ? false
            : boolean(column.compact, `${keyPath}.compact`),
      };
    });
  }

  return {
    root: section(root, "(root)"),
    fail,
    section,
    string,
    boolean,
    integer,
    columns,
  };
}

export interface TableColumnConfig<Key extends string = string> {
  key: Key;
  label: string;
  visible: boolean;
  /*
   * Relative width: the column's share of the sum of all visible widths (see
   * `toPercentWidths`). Written in pixels at the table's design width. 0 for a
   * hidden column that declares none.
   */
  width: number;
  /* Narrow lookup column with tighter padding (Raw Litho). */
  compact: boolean;
}
