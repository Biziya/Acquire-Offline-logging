import { useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  BODY_CELL,
  HEADER_CELL,
  TABLE,
  TABLE_FRAME,
  bodyRowClass,
} from "../../components/dataTableStyles";
// Appearance only: the Raw Litho table's own column list (order, labels,
// widths), row height, minimum width and "Ins" column, so the two tables
// cannot drift apart. Nothing from Raw Litho's editing code is used.
import { rawLithoConfig } from "../RawLitho/config";
import { INDEX_COLUMN_WIDTH, tableColumns } from "../RawLitho/constants";
import { CELL_INPUT } from "../RawLitho/rawLithoStyles";
import { databaseViewerConfig } from "./config";
import {
  intervalKey,
  type DataViewerInterval,
  type DataViewerValue,
} from "./databaseViewerTypes";

interface DatabaseViewerTableProps {
  intervals: readonly DataViewerInterval[];
  emptyMessage: string;
  initialScrollTop: number;
  onScroll: (scrollTop: number) => void;
}

const { rowHeight, minWidth } = rawLithoConfig;
const { overscan } = databaseViewerConfig;

// Raw Litho's cell text: same size and alignment as its inputs, without the
// input box. `truncate` keeps long values on one line (full text on hover).
const CELL_TEXT = CELL_INPUT.split(" ")
  .filter((name) => /^(text-|py-)/.test(name))
  .join(" ");

// At least two decimals, never rounded, no thousands separator: 5 → "5.00",
// 12.125 → "12.125". Only how the stored number is written changes.
const depthFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 20,
  useGrouping: false,
});

function depthText(value: DataViewerValue) {
  if (value === null) return "";
  return typeof value === "number" ? depthFormat.format(value) : String(value);
}

function cellText(interval: DataViewerInterval, key: string) {
  if (key === "lithoFrom") return depthText(interval.lithoFrom);
  if (key === "lithoTo") return depthText(interval.lithoTo);
  return interval.values[key as keyof DataViewerInterval["values"]] ?? "";
}

/*
 * Read-only and styled like the Raw Litho table — same frame, header, cells,
 * zebra rows and hover — but virtualized: only the rows in view (plus
 * `overscan`) are in the DOM, and two spacer rows stand in for the rest,
 * which keeps real <table> layout and the sticky header. Values are plain
 * text; there are no inputs.
 */
function DatabaseViewerTable({
  intervals,
  emptyMessage,
  initialScrollTop,
  onScroll,
}: DatabaseViewerTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: intervals.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    initialOffset: initialScrollTop,
    getItemKey: (index) => {
      const interval = intervals[index];
      return interval ? intervalKey(interval) : index;
    },
  });

  // Back to where the user was when the page was left.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop;
    // Only on mount: later scrolling is the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom =
    virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0);
  const columnCount = tableColumns.length + 1;

  return (
    <div
      ref={scrollRef}
      className={TABLE_FRAME}
      tabIndex={0}
      role="region"
      aria-label="Lithology records"
      onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
    >
      <table
        className={TABLE}
        style={{ minWidth }}
        aria-rowcount={intervals.length + 1}
      >
        <thead>
          <tr>
            <th className={HEADER_CELL} style={{ width: INDEX_COLUMN_WIDTH }}>
              Ins
            </th>
            {tableColumns.map((column) => (
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
            const interval = intervals[item.index];
            if (!interval) return null;

            return (
              <tr
                key={item.key}
                className={bodyRowClass(item.index)}
                style={{ height: rowHeight }}
                aria-rowindex={item.index + 2}
              >
                <td className={BODY_CELL}>{item.index + 1}</td>
                {tableColumns.map((column) => {
                  const text = cellText(interval, column.key);

                  return (
                    <td
                      key={column.key}
                      className={`${BODY_CELL} ${CELL_TEXT} truncate px-1`}
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

      {intervals.length === 0 && (
        <p className="m-0 p-6 text-center text-[0.85rem] text-rl-text-muted">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

export default DatabaseViewerTable;
