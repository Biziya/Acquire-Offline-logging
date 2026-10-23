import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  BODY_CELL,
  HEADER_CELL,
  TABLE,
  TABLE_FRAME,
  bodyRowClass,
  toPercentWidths,
} from "../../components/dataTableStyles";
// Appearance only: Raw Litho's row height and index-column width, so both
// tables look the same. Nothing from Raw Litho's editing code is used.
import { rawLithoConfig } from "../RawLitho/config";
import {
  DATA_VIEWER_COLUMNS,
  type DataViewerRecord,
  type DataViewerValue,
} from "./databaseViewerTypes";
import { databaseViewerConfig } from "./config";

interface DatabaseViewerTableProps {
  records: readonly DataViewerRecord[];
  emptyMessage: string;
}

const { rowHeight, indexColumnWidth } = rawLithoConfig;
const { overscan, minWidth } = databaseViewerConfig;

const [indexWidth, ...columnWidths] = toPercentWidths([
  indexColumnWidth,
  ...DATA_VIEWER_COLUMNS.map((column) => column.width),
]);

// At least two decimals, never rounded, no thousands separator: 5 → "5.00",
// 12.125 → "12.125". Only how the stored number is written changes.
const depthFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 20,
  useGrouping: false,
});

/* The stored value as text. NULL is an empty cell; nothing is filled in. */
function cellText(value: DataViewerValue, isDepth: boolean) {
  if (value === null) return "";
  if (isDepth && typeof value === "number") return depthFormat.format(value);
  return String(value);
}

/*
 * Read-only and virtualized like the Raw Litho table: only the rows in view
 * (plus `overscan`) are in the DOM, and two spacer rows stand in for the
 * rest, which keeps real <table> layout and the sticky header. Values are
 * plain text — there are no inputs. Rows are shown in the API's order
 * (FROM, TO, PRIORITY, NAME).
 */
function DatabaseViewerTable({ records, emptyMessage }: DatabaseViewerTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom =
    virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0);
  const columnCount = DATA_VIEWER_COLUMNS.length + 1;

  return (
    <div
      ref={scrollRef}
      className={TABLE_FRAME}
      tabIndex={0}
      role="region"
      aria-label="Database records"
    >
      <table
        className={TABLE}
        style={{ minWidth }}
        aria-rowcount={records.length + 1}
      >
        <thead>
          <tr>
            <th className={HEADER_CELL} style={{ width: indexWidth }}>
              #
            </th>
            {DATA_VIEWER_COLUMNS.map((column, index) => (
              <th
                key={column.key}
                className={HEADER_CELL}
                style={{ width: columnWidths[index] }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true" style={{ height: paddingTop }}>
              <td colSpan={columnCount} />
            </tr>
          )}

          {items.map((item) => {
            const record = records[item.index];
            if (!record) return null;

            return (
              <tr
                key={item.key}
                className={bodyRowClass(item.index)}
                style={{ height: rowHeight }}
                aria-rowindex={item.index + 2}
              >
                <td className={BODY_CELL}>{item.index + 1}</td>
                {DATA_VIEWER_COLUMNS.map((column) => {
                  const text = cellText(record[column.key], Boolean(column.depth));

                  return (
                    <td
                      key={column.key}
                      className={`${BODY_CELL} truncate px-1 text-rl-text`}
                      title={text || undefined}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {paddingBottom > 0 && (
            <tr aria-hidden="true" style={{ height: paddingBottom }}>
              <td colSpan={columnCount} />
            </tr>
          )}
        </tbody>
      </table>

      {records.length === 0 && (
        <p className="m-0 p-6 text-center text-[0.85rem] text-rl-text-muted">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

export default DatabaseViewerTable;
