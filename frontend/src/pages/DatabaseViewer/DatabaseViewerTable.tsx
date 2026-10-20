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
// Appearance only: the Raw Litho table's column order, labels, widths, row
// height and minimum width. Nothing from Raw Litho's editing code is used.
import { rawLithoConfig } from "../RawLitho/config";
import {
  LITHOLOGY_COLUMN_KEYS,
  type LithologyRecord,
} from "./databaseViewerTypes";
import { databaseViewerConfig } from "./config";

interface DatabaseViewerTableProps {
  records: readonly LithologyRecord[];
  emptyMessage: string;
}

const { rowHeight, minWidth, indexColumnWidth } = rawLithoConfig;
const { overscan } = databaseViewerConfig;

const columns = rawLithoConfig.columns.flatMap((column) => {
  const key = LITHOLOGY_COLUMN_KEYS.find((item) => item === column.key);
  return column.visible && key ? [{ key, label: column.label, width: column.width }] : [];
});
const [indexWidth, ...columnWidths] = toPercentWidths([
  indexColumnWidth,
  ...columns.map((column) => column.width),
]);

/*
 * Read-only, virtualized and styled exactly like the Raw Litho table: only
 * the rows in view (plus `overscan`) are in the DOM, and two spacer rows stand
 * in for the rest, which keeps real <table> layout and the sticky header.
 * Values are plain text — there are no inputs. Rows are keyed by record id.
 */
function DatabaseViewerTable({ records, emptyMessage }: DatabaseViewerTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (index) => records[index]?.id ?? index,
  });

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom =
    virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0);
  const columnCount = columns.length + 1;

  return (
    <div
      ref={scrollRef}
      className={TABLE_FRAME}
      tabIndex={0}
      role="region"
      aria-label="Lithology records"
    >
      <table
        className={TABLE}
        style={{ minWidth }}
        aria-rowcount={records.length + 1}
      >
        <thead>
          <tr>
            <th className={HEADER_CELL} style={{ width: indexWidth }}>
              Ins
            </th>
            {columns.map((column, index) => (
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
                {columns.map((column) => {
                  const value = String(record[column.key]);

                  return (
                    <td
                      key={column.key}
                      className={`${BODY_CELL} truncate px-1 text-rl-text`}
                      title={value || undefined}
                    >
                      {value}
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
