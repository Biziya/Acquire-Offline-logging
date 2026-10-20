import type {
  RawLithoRow as RawLithoRowRecord,
  RowField,
  LookupData,
  LookupStatuses,
  RowChange,
  AddRowResult,
} from "../../types/domain";
import { useCallback, useEffect, useMemo, useRef } from "react";
import RawLithoRow from "./RawLithoRow";
import { useRawLithoShortcuts } from "./hooks/useRawLithoShortcuts";
import { useRawLithoRowFocus } from "./hooks/useRawLithoRowFocus";
import { isKeyAlreadyHandled, isRowCreationKey } from "./tableNavigation";
import { findDuplicateIntervalRowIds } from "./rawLithoValidation";
import {
  COMPACT_COLUMN_KEYS,
  RAW_LITHO_ROWS_PER_PAGE,
  REQUIRED_COLUMN_KEYS,
  tableColumns,
} from "./constants";

interface RawLithoTableProps {
  rows: RawLithoRowRecord[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  lookupData: LookupData;
  lookupStatus: LookupStatuses;
  onRowChange: RowChange;
  onDepthCommit: RowChange;
  onAddRow: () => AddRowResult;
  onRemoveLastRow: () => void;
  isEnabled: boolean;
  isBlocked?: boolean;
}








const FALLBACK_FOCUS_FIELD = "lithoTo";

function buildHeaderClassName(columnKey: RowField, isRequired: boolean) {
  return [
    "raw-litho-col",
    `raw-litho-col--${columnKey}`,
    COMPACT_COLUMN_KEYS.has(columnKey) ? "raw-litho-col--compact" : "",
    isRequired ? "raw-litho-header--required" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function RawLithoTable({
  rows,
  currentPage,
  totalPages,
  onPageChange,
  lookupData,
  lookupStatus,
  onRowChange,
  onDepthCommit,
  onAddRow,
  onRemoveLastRow,
  isEnabled,
  isBlocked = false,
}: RawLithoTableProps) {
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  const pageStartIndex = (currentPage - 1) * RAW_LITHO_ROWS_PER_PAGE;
  const visibleRows = useMemo(
    () => rows.slice(pageStartIndex, pageStartIndex + RAW_LITHO_ROWS_PER_PAGE),
    [pageStartIndex, rows],
  );
  const duplicateRowIds = useMemo(
    () => findDuplicateIntervalRowIds(rows),
    [rows],
  );
  const firstVisibleRow = rows.length === 0 ? 0 : pageStartIndex + 1;
  const lastVisibleRow = Math.min(
    pageStartIndex + visibleRows.length,
    rows.length,
  );

  // The final row always lives on the final page.
  const isLastRowVisible = currentPage === totalPages;
  const canRemoveLastRow = isEnabled && rows.length > 1;

  useEffect(() => {
    if (tableWrapperRef.current) {
      tableWrapperRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  const { focusRowCell, requestFocus, handleTableFocus } = useRawLithoRowFocus({
    tableBodyRef,
    rows,
    currentPage,
    rowsPerPage: RAW_LITHO_ROWS_PER_PAGE,
    onPageChange,
  });

  /*
   * Every route into row creation goes through here: the Add Row button, F4,
   * Tab from the last cell and ArrowDown from the last row. `onAddRow` owns the
   * validation; this function owns only where the caret ends up.
   *
   * Both branches address the row by id, because the new row is sorted into
   * position by Litho From and is not necessarily the last row.
   */
  const requestAddRow = useCallback(() => {
    const result = onAddRow();

    if (result?.created) {
      requestFocus(result.rowId);
      return result;
    }

    // Focus locks onto the invalid cell, changing page if it is out of view.
    if (result?.rowId === undefined) return result;

    focusRowCell(result.rowId, result.focusField ?? FALLBACK_FOCUS_FIELD);
    return result;
  }, [focusRowCell, onAddRow, requestFocus]);

  useRawLithoShortcuts({
    isEnabled,
    isBlocked,
    currentPage,
    totalPages,
    canRemoveLastRow,
    onAddRow: requestAddRow,
    onRemoveLastRow,
    onPageChange,
  });

  function handleTableKeyDown(
    event: React.KeyboardEvent<HTMLTableSectionElement>,
  ) {
    if (!isEnabled || isBlocked) return;

    // A cell handler (arrow navigation, lookup dropdown) already used this key.
    if (isKeyAlreadyHandled(event)) return;

    // Only the final page ends at the final row of the document.
    if (!isLastRowVisible) return;
    if (!isRowCreationKey(event, tableBodyRef.current)) return;

    event.preventDefault();
    requestAddRow();
  }

  return (
    <div className="raw-litho-table-section">
      <div ref={tableWrapperRef} className="raw-litho-table-wrapper">
        <table className="raw-litho-table">
          <thead>
            <tr>
              <th className="raw-litho-col raw-litho-col--index">Ins</th>

              {tableColumns.map((column) => {
                const isRequired = REQUIRED_COLUMN_KEYS.has(column.key);

                return (
                  <th
                    key={column.key}
                    className={buildHeaderClassName(column.key, isRequired)}
                  >
                    {column.label}
                    {isRequired && (
                      <abbr
                        className="raw-litho-required-marker"
                        title="Required field"
                      >
                        *
                      </abbr>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody
            ref={tableBodyRef}
            onKeyDown={handleTableKeyDown}
            onFocus={handleTableFocus}
          >
            {visibleRows.map((row, pageRowIndex) => (
              <RawLithoRow
                key={row.id}
                row={row}
                rowIndex={pageStartIndex + pageRowIndex}
                lookupData={lookupData}
                lookupStatus={lookupStatus}
                onRowChange={onRowChange}
                onDepthCommit={onDepthCommit}
                isEnabled={isEnabled}
                hasDuplicateInterval={duplicateRowIds.has(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <nav className="raw-litho-pagination" aria-label="Raw Litho table pages">
        <button
          className="raw-litho-pagination-button"
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label={`Show previous ${RAW_LITHO_ROWS_PER_PAGE} Raw Litho rows (PageUp)`}
        >
          Previous
        </button>

        <div className="raw-litho-pagination-status" aria-live="polite">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <span className="raw-litho-pagination-range">
            Rows {firstVisibleRow}–{lastVisibleRow} of {rows.length}
          </span>
        </div>

        <button
          className="raw-litho-pagination-button"
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label={`Show next ${RAW_LITHO_ROWS_PER_PAGE} Raw Litho rows (PageDown)`}
        >
          Next
        </button>
      </nav>

      <div className="raw-litho-row-actions">
        {/*
          Stays clickable while the page is enabled: `requestAddRow` is what
          reports the missing fields or the duplicate interval, so disabling the
          button would hide the reason the row was rejected.
        */}
        <button
          className="raw-litho-row-action-button"
          type="button"
          onClick={requestAddRow}
          disabled={!isEnabled}
          title="Add Row (F4)"
        >
          Add Row (F4)
        </button>

        <button
          className="raw-litho-row-action-button raw-litho-remove-row-button"
          type="button"
          onClick={onRemoveLastRow}
          disabled={!canRemoveLastRow}
          title="Remove Last Row (F5)"
        >
          Remove Last Row (F5)
        </button>
      </div>
    </div>
  );
}

export default RawLithoTable;
