import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LithologyRecord } from "./databaseViewerTypes";
import { databaseViewerConfig } from "./config";

interface DatabaseViewerTableProps {
  records: readonly LithologyRecord[];
}

const { columns, rowHeight, overscan, minWidth, indexColumnWidth } =
  databaseViewerConfig;

// Same look as the Raw Litho table: sticky navy-tint header, light grid,
// zebra rows, 0.78rem cells.
const HEADER_CELL = [
  "sticky top-0 z-[3] border border-rl-grid bg-rl-navy-softer p-[3px] text-center",
  "text-[0.7rem] leading-[1.1] font-semibold tracking-[0.01em] whitespace-normal",
  "text-rl-text [overflow-wrap:anywhere]",
  "shadow-[inset_1px_0_0_var(--color-rl-grid),inset_-1px_0_0_var(--color-rl-grid),inset_0_1px_0_var(--color-rl-grid),inset_0_-1px_0_var(--color-rl-border-strong)]",
].join(" ");
const CELL =
  "overflow-hidden border border-rl-grid px-1 text-center text-[0.78rem] text-ellipsis whitespace-nowrap text-rl-text";

/*
 * Read-only, virtualized: only the rows in view (plus `overscan`) are in the
 * DOM, so 100,000 records scroll like 100. Two spacer rows stand in for the
 * rows above and below the window, which keeps real <table> layout and the
 * sticky header. Rows are keyed by the record id.
 */
function DatabaseViewerTable({ records }: DatabaseViewerTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (index) => records[index]?.id ?? index,
    // Lets the first render (and jsdom, which has no layout) show rows
    // before the scroll container has been measured.
    initialRect: { width: minWidth, height: rowHeight * 30 },
  });

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom =
    virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0);
  const columnCount = columns.length + 1;

  return (
    <div
      ref={scrollRef}
      className="min-h-0 w-full max-w-full flex-1 overflow-auto rounded-xl border border-rl-border bg-white shadow-[0_1px_2px_rgb(16_35_61/6%)]"
      tabIndex={0}
      role="region"
      aria-label="Lithology records"
    >
      <table
        className="w-full table-fixed border-collapse bg-white"
        style={{ minWidth }}
        aria-rowcount={records.length + 1}
      >
        <thead>
          <tr>
            <th className={HEADER_CELL} style={{ width: indexColumnWidth }}>
              #
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                className={HEADER_CELL}
                style={{ width: column.width }}
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
                className={`${item.index % 2 === 1 ? "bg-[#f9fbfd]" : "bg-white"} hover:bg-rl-navy-soft`}
                style={{ height: rowHeight }}
                aria-rowindex={item.index + 2}
              >
                <td className={`${CELL} text-rl-text-muted`}>
                  {item.index + 1}
                </td>
                {columns.map((column) => {
                  const value = String(record[column.key]);

                  return (
                    <td
                      key={column.key}
                      className={
                        column.key === "lithologyComments"
                          ? `${CELL} text-left`
                          : CELL
                      }
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
          No records match the current search and filters.
        </p>
      )}
    </div>
  );
}

export default DatabaseViewerTable;
