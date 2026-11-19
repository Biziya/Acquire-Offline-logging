import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  BODY_CELL,
  CELL_INPUT,
  HEADER_CELL,
  TABLE,
  TABLE_FRAME,
  bodyRowClass,
} from "../../components/dataTableStyles";
// Appearance only: Raw Litho's row height, minimum width and "No." column.
import { rawLithoConfig } from "../RawLitho/config";
import { INDEX_COLUMN_WIDTH } from "../RawLitho/constants";
import LookupAutocomplete from "../RawLitho/LookupAutocomplete";
import { handleCellNavigation } from "../RawLitho/tableNavigation";
import { rawExtractionConfig } from "./config";
import {
  rawExtractionColumns,
  type RawExtractionField,
  type RawExtractionRow,
} from "./rawExtractionColumns";

interface RawExtractionTableProps {
  rows: readonly RawExtractionRow[];
  emptyMessage: string;
  onCellChange: (rowId: number, field: RawExtractionField, value: string) => void;
}

const { rowHeight, minWidth } = rawLithoConfig;
const { overscan } = rawExtractionConfig;

/*
 * Editable table in the Raw Litho look: same frame, header, cells, zebra
 * rows and keyboard movement (arrows and Tab between cells, the dropdowns'
 * own keys). Virtualized like the other tables: only the rows in view plus
 * `overscan` are in the DOM, with two spacer rows for the rest.
 */
function RawExtractionTable({ rows, emptyMessage, onCellChange }: RawExtractionTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0);
  const columnCount = rawExtractionColumns.length + 1;

  return (
    <div ref={scrollRef} className={TABLE_FRAME} role="region" aria-label="Core runs">
      <table className={TABLE} style={{ minWidth }} aria-rowcount={rows.length + 1}>
        <thead>
          <tr>
            <th className={HEADER_CELL} style={{ width: INDEX_COLUMN_WIDTH }}>
              No.
            </th>
            {rawExtractionColumns.map((column) => (
              <th key={column.key} className={HEADER_CELL} style={{ width: column.width }}>
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
            const row = rows[item.index];
            if (!row) return null;

            return (
              <tr
                key={item.key}
                className={bodyRowClass(item.index)}
                style={{ height: rowHeight }}
                aria-rowindex={item.index + 2}
                data-row-id={row.id}
              >
                <td className={BODY_CELL}>{item.index + 1}</td>
                {rawExtractionColumns.map((column) => (
                  <td key={column.key} className={BODY_CELL} data-column={column.key}>
                    {column.lookup ? (
                      <LookupAutocomplete
                        rowIndex={item.index}
                        lookup={column.lookup}
                        records={column.lookup.options}
                        value={row[column.key]}
                        onValueChange={(value) => onCellChange(row.id, column.key, value)}
                        isEnabled
                        isLoading={false}
                        error=""
                      />
                    ) : (
                      <input
                        className={`${CELL_INPUT} px-1`}
                        type="number"
                        step="any"
                        value={row[column.key]}
                        aria-label={`${column.label}, row ${item.index + 1}`}
                        onKeyDown={(event) => {
                          handleCellNavigation(event);
                        }}
                        onChange={(event) =>
                          onCellChange(row.id, column.key, event.target.value)
                        }
                      />
                    )}
                  </td>
                ))}
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

      {rows.length === 0 && (
        <p className="m-0 p-6 text-center text-[0.875rem] text-rl-text-muted">{emptyMessage}</p>
      )}
    </div>
  );
}

export default RawExtractionTable;
