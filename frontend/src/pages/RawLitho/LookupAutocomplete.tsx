import type { LookupDefinition, LookupRecord } from "../../types/domain";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  handleCellNavigation,
  isClearCellRequest,
  isNavigationFocus,
  markKeyAsHandled,
  moveFocusHorizontally,
} from "./tableNavigation";
import { CELL_INPUT } from "./rawLithoStyles";

interface LookupAutocompleteProps {
  rowIndex: number;
  lookup: LookupDefinition;
  records: readonly LookupRecord[];
  value: string;
  onValueChange: (value: string) => void;
  isPageEnabled: boolean;
  isLoading: boolean;
  error: string;
  isCompact?: boolean;
  isRequired?: boolean;
}




const MATCH_LIMIT = 5;
const LOOKUP_OPEN_EVENT = "raw-litho-lookup-open";

const MENU_ITEM =
  "overflow-hidden rounded px-[9px] py-[7px] text-ellipsis whitespace-nowrap";
const MENU_STATUS = "text-[0.8rem] text-rl-text-muted";
const CELL_ERROR =
  "absolute top-[calc(100%+2px)] left-1 z-10 rounded-[3px] bg-[#fdf0ef] px-[5px] py-0.5 text-[0.7rem] whitespace-nowrap text-rl-danger";

function hasModifier(event: React.KeyboardEvent<HTMLInputElement>) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function normalize(value: unknown) {
  return value === null || value === undefined
    ? ""
    : String(value).trim().toLocaleLowerCase();
}

function toInputValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function getMatchRank(code: string, normalizedQuery: string) {
  const normalizedCode = normalize(code);

  if (normalizedCode === normalizedQuery) return 0;
  if (normalizedCode.startsWith(normalizedQuery)) return 1;
  if (normalizedCode.includes(normalizedQuery)) return 2;
  return null;
}

function LookupAutocomplete({
  rowIndex,
  lookup,
  records,
  value,
  onValueChange,
  isPageEnabled,
  isLoading,
  error,
  isCompact = false,
  isRequired = false,
}: LookupAutocompleteProps) {
  const generatedId = useId();
  const instanceId = `lookup-${generatedId}`;
  const suggestionListId = `${instanceId}-list`;
  const validationId = `${instanceId}-validation`;
  const loadErrorId = `${instanceId}-load-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const skipNextEmptyValueSync = useRef(false);
  /*
   * True from the first keystroke until the value settles. It is what separates
   * "searching the list" from "sitting in a cell that already has a value":
   * only while searching do ArrowLeft / ArrowRight accept the highlighted match
   * instead of moving the caret.
   */
  const isSearching = useRef(false);
  /*
   * Set while a fast accept is moving focus out of the cell. Moving focus fires
   * `blur` synchronously, before React has re-rendered with the accepted value,
   * so `finishEditing` would still see the partial query and flag it invalid.
   */
  const isAcceptingMatch = useRef(false);
  const [query, setQuery] = useState(() => toInputValue(value));
  const [isOpen, setIsOpen] = useState(false);
  const [showInvalidSelection, setShowInvalidSelection] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const options = useMemo(() => {
    const seen = new Set();

    return records.flatMap((record) => {
      const code = record?.[lookup.codeProperty];
      const normalizedCode = normalize(code);

      if (
        typeof code !== "string" ||
        !normalizedCode ||
        seen.has(normalizedCode)
      )
        return [];
      seen.add(normalizedCode);
      return [{ code: code.trim() }];
    });
  }, [lookup.codeProperty, records]);

  const exactOption = useMemo(() => {
    const normalizedQuery = normalize(query);
    return options.find((option) => normalize(option.code) === normalizedQuery);
  }, [options, query]);

  const suggestions = useMemo(() => {
    const normalizedQuery = normalize(query);

    if (!normalizedQuery) return options;

    return options
      .map((option) => ({
        option,
        rank: getMatchRank(option.code, normalizedQuery),
      }))
      .filter((entry): entry is { option: { code: string }; rank: number } => entry.rank !== null)
      .sort(
        (first, second) =>
          first.rank - second.rank ||
          first.option.code.localeCompare(second.option.code),
      )
      .slice(0, MATCH_LIMIT)
      .map(({ option }) => option);
  }, [options, query]);

  /*
   * The list is ranked exact match → prefix match → substring match, so the
   * closest match is always the first entry. Highlighting is derived rather
   * than stored because the keyboard no longer walks the list.
   */
  const highlightedIndex = suggestions.length === 0 ? -1 : 0;
  const highlightedSuggestion = suggestions[highlightedIndex] ?? null;

  const isDisabled = !isPageEnabled || (!isLoading && options.length === 0);
  const showSuggestions = isOpen && isPageEnabled;

  useEffect(() => {
    if (skipNextEmptyValueSync.current && toInputValue(value) === "") {
      skipNextEmptyValueSync.current = false;
      return;
    }

    setQuery(toInputValue(value));
    setShowInvalidSelection(false);
  }, [value]);

  useEffect(() => {
    function closeWhenAnotherLookupOpens(event: Event) {
      if (event instanceof CustomEvent && event.detail !== instanceId) {
        setIsOpen(false);
      }
    }

    window.addEventListener(LOOKUP_OPEN_EVENT, closeWhenAnotherLookupOpens);
    return () =>
      window.removeEventListener(
        LOOKUP_OPEN_EVENT,
        closeWhenAnotherLookupOpens,
      );
  }, [instanceId]);

  useEffect(() => {
    if (!showSuggestions) return undefined;

    function positionMenu() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;

      setMenuStyle({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 150),
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [showSuggestions]);

  function openDropdown() {
    window.dispatchEvent(
      new CustomEvent(LOOKUP_OPEN_EVENT, { detail: instanceId }),
    );
    setIsOpen(true);
  }

  function commitValue(nextValue: string) {
    if (nextValue !== value) onValueChange(nextValue);
  }

  function selectSuggestion(suggestion: { code: string }) {
    isSearching.current = false;
    setQuery(suggestion.code);
    setIsOpen(false);
    setShowInvalidSelection(false);
    commitValue(suggestion.code);
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextQuery = event.target.value;

    if (
      (lookup.maxLength && nextQuery.length > lookup.maxLength) ||
      (lookup.isInputAllowed && !lookup.isInputAllowed(nextQuery))
    ) {
      return;
    }

    isSearching.current = true;
    setQuery(nextQuery);
    openDropdown();
    setShowInvalidSelection(false);

    if (value && normalize(nextQuery) !== normalize(value)) {
      skipNextEmptyValueSync.current = true;
      commitValue("");
    }
  }

  function clearCellValue() {
    isSearching.current = false;
    setQuery("");
    setShowInvalidSelection(false);
    openDropdown();
    commitValue("");
  }

  function finishEditing() {
    if (isAcceptingMatch.current) {
      isAcceptingMatch.current = false;
      return;
    }

    if (!query.trim()) {
      setQuery("");
      commitValue("");
      setShowInvalidSelection(false);
    } else if (exactOption) {
      setQuery(exactOption.code);
      commitValue(exactOption.code);
      setShowInvalidSelection(false);
    } else {
      setShowInvalidSelection(true);
    }

    isSearching.current = false;
    setIsOpen(false);
  }

  /*
   * Fast accept. While the user is searching, ArrowRight / ArrowLeft / Tab /
   * Shift + Tab take the highlighted closest match, close the list and move one
   * cell right / left, so a partially typed code never has to be finished by
   * hand.
   *
   * It only fires when there is something valid to accept, so a query with no
   * match can never write a wrong value into the cell. A cell the user has not
   * typed into is left to `handleCellNavigation`, which keeps the ordinary
   * caret-edge behaviour for reading and editing an existing value.
   */
  function acceptClosestMatch(event: React.KeyboardEvent<HTMLInputElement>) {
    const isTab = event.key === "Tab";

    if (isTab ? event.altKey || event.ctrlKey || event.metaKey : hasModifier(event))
      return false;
    if (!isSearching.current || !showSuggestions) return false;
    if (!query.trim() || !highlightedSuggestion) return false;

    selectSuggestion(highlightedSuggestion);
    isAcceptingMatch.current = true;

    /*
     * Tab keeps its own route after accepting: the next / previous cell on this
     * page, or — when there is none — the event bubbles on to the table, which
     * crosses the page or appends a row (Tab only, never Shift + Tab). Either can
     * move focus synchronously, before React re-renders with the accepted
     * value, so blurs are ignored until this keydown has been dispatched.
     */
    if (isTab) {
      queueMicrotask(() => {
        isAcceptingMatch.current = false;
      });
      handleCellNavigation(event);
      return true;
    }

    event.preventDefault();
    markKeyAsHandled(event);
    const hasMoved = moveFocusHorizontally(
      event.currentTarget,
      event.key === "ArrowRight" ? 1 : -1,
    );

    // No neighbouring cell: focus stayed, so no blur was skipped.
    if (!hasMoved) isAcceptingMatch.current = false;

    return true;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (isClearCellRequest(event)) {
      event.preventDefault();
      clearCellValue();
      return;
    }

    if (event.key === "Escape") {
      isSearching.current = false;
      setQuery(toInputValue(value));
      setShowInvalidSelection(false);
      setIsOpen(false);
      return;
    }

    // Tab / Shift + Tab accept the highlighted match like ArrowRight / ArrowLeft.
    // With nothing to accept they settle the value exactly as before, then move
    // through the shared table navigation.
    if (event.key === "Tab") {
      if (acceptClosestMatch(event)) return;

      finishEditing();
      handleCellNavigation(event);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (acceptClosestMatch(event)) return;

      handleCellNavigation(event);
      return;
    }

    /*
     * ArrowUp / ArrowDown never walk the suggestion list — that list is a mouse
     * and mouse-wheel surface. The vertical keys belong to the table:
     *   1. a row exists above / below → focus moves one cell vertically,
     *   2. otherwise the event bubbles unhandled, so ArrowDown on the last row
     *      reaches `handleTableKeyDown` and appends a row.
     */
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      handleCellNavigation(event);
      return;
    }

    if (event.key === "Enter" && isOpen) {
      if (highlightedSuggestion) {
        event.preventDefault();
        selectSuggestion(highlightedSuggestion);
      }
    }
  }

  let placeholder = "";
  if (isLoading && options.length === 0) placeholder = "Loading...";
  else if (error && options.length === 0) placeholder = "Unavailable";
  else if (options.length === 0) placeholder = "No values";

  function handleFocus() {
    isSearching.current = false;
    isAcceptingMatch.current = false;

    if (isNavigationFocus()) return;

    openDropdown();
  }

  const dropdown = showSuggestions
    ? createPortal(
        <ul
          id={suggestionListId}
          className="fixed z-[1000] m-0 max-h-[220px] max-w-[320px] min-w-[150px] list-none overflow-y-auto rounded-lg border border-rl-border bg-white p-1 text-left shadow-[0_10px_24px_rgb(16_35_61/16%)]"
          role="listbox"
          style={menuStyle}
        >
          {isLoading && options.length === 0 && (
            <li className={`${MENU_ITEM} ${MENU_STATUS}`} role="status">
              Loading values…
            </li>
          )}

          {suggestions.map((suggestion, index) => (
            <li
              id={`${suggestionListId}-option-${index}`}
              className={`${MENU_ITEM} cursor-pointer hover:bg-rl-navy-soft hover:text-rl-navy-dark${
                index === highlightedIndex
                  ? " raw-litho-lookup-suggestion--active bg-rl-navy-soft text-rl-navy-dark"
                  : ""
              }`}
              key={suggestion.code}
              role="option"
              aria-selected={normalize(suggestion.code) === normalize(value)}
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(suggestion);
              }}
            >
              {suggestion.code}
            </li>
          ))}

          {!isLoading && suggestions.length === 0 && (
            <li
              className={`${MENU_ITEM} text-rl-text-muted`}
              role="option"
              aria-disabled="true"
              aria-selected="false"
            >
              {error || "No matching values"}
            </li>
          )}

          {isLoading && options.length > 0 && (
            <li className={`${MENU_ITEM} ${MENU_STATUS}`} role="status">
              Refreshing values…
            </li>
          )}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div className="relative h-full min-w-0">
      <input
        ref={inputRef}
        className={`peer ${CELL_INPUT} ${isCompact ? "px-[9px]" : "px-[13px]"}`}
        type="text"
        role="combobox"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={lookup.maxLength}
        inputMode={lookup.inputMode}
        pattern={lookup.inputMode === "numeric" ? "[0-9]*" : undefined}
        disabled={isDisabled}
        aria-label={`${lookup.label}, row ${rowIndex + 1}`}
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={suggestionListId}
        aria-activedescendant={
          highlightedSuggestion
            ? `${suggestionListId}-option-${highlightedIndex}`
            : undefined
        }
        aria-describedby={
          error && options.length === 0
            ? loadErrorId
            : showInvalidSelection
              ? validationId
              : undefined
        }
        aria-invalid={showInvalidSelection}
        required={isRequired}
        onChange={handleQueryChange}
        onFocus={handleFocus}
        onBlur={finishEditing}
        onKeyDown={handleKeyDown}
      />

      {!isDisabled && (
        <span
          className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 transition-transform duration-120 ${
            isCompact ? "right-px w-[7px]" : "right-[3px] w-[9px]"
          } ${
            showSuggestions
              ? "rotate-180 text-rl-navy"
              : "text-[#8b9ab0] peer-hover:text-rl-navy"
          }`}
          aria-hidden="true"
          data-open={showSuggestions ? "true" : "false"}
        >
          <svg className="h-auto w-full" viewBox="0 0 10 6" focusable="false">
            <path
              d="M1 1.5 5 5l4-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}

      {dropdown}

      {showInvalidSelection && (
        <span id={validationId} className={CELL_ERROR}>
          Select a valid value
        </span>
      )}

      {error && options.length === 0 && (
        <span id={loadErrorId} className={CELL_ERROR} role="status">
          {error}
        </span>
      )}
    </div>
  );
}

export default LookupAutocomplete;
