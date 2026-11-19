import type { LookupDefinition, LookupRecord } from "../../types/domain";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  handleCellNavigation,
  isClearCellRequest,
  markKeyAsHandled,
} from "./tableNavigation";
import { CELL_INPUT } from "../../components/dataTableStyles";
import {
  DROPDOWN_MUTED,
  DROPDOWN_OPTION_ACTIVE,
  DROPDOWN_OPTION_HOVER,
  TABLE_DROPDOWN_MENU,
  TABLE_DROPDOWN_OPTION,
} from "../../components/dropdownStyles";
import { useAnchoredMenuStyle } from "../../components/useAnchoredMenuStyle";

interface LookupAutocompleteProps {
  rowIndex: number;
  // Only what the cell uses, so other pages can pass their own lists.
  lookup: Omit<LookupDefinition, "fieldKey"> & { fieldKey?: string };
  records: readonly LookupRecord[];
  value: string;
  onValueChange: (value: string) => void;
  isEnabled: boolean;
  isLoading: boolean;
  error: string;
  isCompact?: boolean;
  isRequired?: boolean;
  // Extra data-* attributes for the input (Upload Data finds cells by them).
  inputData?: Record<`data-${string}`, string | number>;
  /*
   * Upload Data: when no list could be loaded (server down, nothing saved on
   * this PC), the cell stays editable and saves what is typed instead of
   * locking. Validation reports such codes as not checked.
   */
  allowUnlistedCodes?: boolean;
}

const MATCH_LIMIT = 5;
const LOOKUP_OPEN_EVENT = "raw-litho-lookup-open";

const MENU_ITEM = TABLE_DROPDOWN_OPTION;
const MENU_STATUS = `text-[0.8125rem] ${DROPDOWN_MUTED}`;
const CELL_ERROR =
  "absolute top-[calc(100%+2px)] left-1 z-10 rounded-sm bg-rl-danger-soft px-[5px] py-0.5 text-[0.75rem] whitespace-nowrap text-rl-danger";

/*
 * The distinct codes of one lookup list. Every cell of a column shares the
 * same `records` array, so the list is built once per array and code
 * property, not once per cell (a long drillhole has thousands of cells).
 */
const optionCache = new WeakMap<readonly LookupRecord[], Map<string, { code: string }[]>>();

function getOptions(records: readonly LookupRecord[], codeProperty: string) {
  let byProperty = optionCache.get(records);
  if (!byProperty) {
    byProperty = new Map();
    optionCache.set(records, byProperty);
  }
  const cached = byProperty.get(codeProperty);
  if (cached) return cached;

  const seen = new Set();
  const options = records.flatMap((record) => {
    const code = record?.[codeProperty];
    const normalizedCode = normalize(code);

    if (typeof code !== "string" || !normalizedCode || seen.has(normalizedCode))
      return [];
    seen.add(normalizedCode);
    return [{ code: code.trim() }];
  });
  byProperty.set(codeProperty, options);
  return options;
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
  isEnabled,
  isLoading,
  error,
  isCompact = false,
  isRequired = false,
  inputData,
  allowUnlistedCodes = false,
}: LookupAutocompleteProps) {
  const generatedId = useId();
  const instanceId = `lookup-${generatedId}`;
  const suggestionListId = `${instanceId}-list`;
  const validationId = `${instanceId}-validation`;
  const loadErrorId = `${instanceId}-load-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when Tab has just accepted a match, so the blur it causes does not
  // judge the stale typed text before the new value arrives.
  const acceptedOnTab = useRef(false);
  // null: table navigation; a list index: explicit option selection (F2).
  const [optionIndex, setOptionIndex] = useState<number | null>(null);
  const [query, setQuery] = useState(() => toInputValue(value));
  const [isOpen, setIsOpen] = useState(false);
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [showInvalidSelection, setShowInvalidSelection] = useState(false);

  const options = getOptions(records, lookup.codeProperty);

  const exactOption = useMemo(() => {
    const normalizedQuery = normalize(query);
    return options.find((option) => normalize(option.code) === normalizedQuery);
  }, [options, query]);

  const suggestions = useMemo(() => {
    const normalizedQuery = normalize(query);

    if (showAllOptions || !normalizedQuery) return [{ code: "" }, ...options];

    const matches = options
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
    return [{ code: "" }, ...matches];
  }, [options, query, showAllOptions]);

  // Empty stays first; Enter confirms the closest typed match.
  const selectedIndex = exactOption ? suggestions.indexOf(exactOption) : -1;
  const defaultIndex = showAllOptions || !query.trim()
    ? Math.max(0, selectedIndex)
    : suggestions.length > 1 ? 1 : -1;
  const highlightedIndex = optionIndex ?? defaultIndex;
  const highlightedSuggestion = suggestions[highlightedIndex] ?? null;

  // No list to pick from, but typing is allowed: a plain text cell.
  const isFreeEntry = allowUnlistedCodes && !isLoading && options.length === 0;
  const isDisabled = !isEnabled || (!isLoading && options.length === 0 && !isFreeEntry);
  const showSuggestions = isOpen && isEnabled && !isFreeEntry;

  useEffect(() => {
    setQuery(toInputValue(value));
    setShowInvalidSelection(false);
  }, [value]);

  // Only an open list listens, so thousands of closed cells add no listeners.
  useEffect(() => {
    if (!isOpen) return undefined;

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
  }, [instanceId, isOpen]);

  const getAnchor = useCallback(() => inputRef.current, []);
  const menuStyle = useAnchoredMenuStyle(showSuggestions, getAnchor);

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
    setOptionIndex(null);
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

    setOptionIndex(null);
    setShowAllOptions(false);
    setQuery(nextQuery);
    openDropdown();
    setShowInvalidSelection(false);

    // Clearing is explicit; a new non-empty code stays a draft until confirmed.
    if (nextQuery === "") commitValue("");
  }

  function clearCellValue() {
    setOptionIndex(null);
    setQuery("");
    setShowInvalidSelection(false);
    openDropdown();
    commitValue("");
  }

  function finishEditing() {
    if (acceptedOnTab.current) {
      acceptedOnTab.current = false;
      setOptionIndex(null);
      setIsOpen(false);
      return;
    }

    if (isFreeEntry) {
      commitValue(query.trim());
      setQuery(query.trim());
      setShowInvalidSelection(false);
      setIsOpen(false);
      return;
    }

    // Retain unmatched text for validation, but never commit on blur.
    const invalid = Boolean(query.trim() && !exactOption);
    setShowInvalidSelection(invalid);
    if (!invalid) setQuery(toInputValue(value));
    setOptionIndex(null);
    setIsOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Alt + Tab belongs entirely to Windows; modified editing keys stay native.
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;

    if (isClearCellRequest(event)) {
      event.preventDefault();
      clearCellValue();
      return;
    }

    // Without a list, Enter, Tab and F2 are table keys; leaving the cell
    // saves the typed code (finishEditing).
    if (isFreeEntry && (event.key === "Enter" || event.key === "Tab" || event.key === "F2")) return;

    if (event.key === "Escape") {
      setOptionIndex(null);
      setQuery(toInputValue(value));
      setShowInvalidSelection(false);
      setIsOpen(false);
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      markKeyAsHandled(event);
      openDropdown();
      setOptionIndex(Math.max(0, highlightedIndex));
      return;
    }

    // F2 explicitly switches vertical arrows from table to option navigation.
    if (optionIndex !== null && !event.shiftKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      markKeyAsHandled(event);
      setOptionIndex(Math.max(0, Math.min(suggestions.length - 1,
        optionIndex + (event.key === "ArrowDown" ? 1 : -1))));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      markKeyAsHandled(event);
      if (isOpen && highlightedSuggestion) selectSuggestion(highlightedSuggestion);
      else if (!isOpen) {
        openDropdown();
        setOptionIndex(Math.max(0, defaultIndex));
      }
      return;
    }

    /*
     * Tab accepts the highlighted option like Enter does, then moves on: the
     * closest match for typed text ("bla" -> "black"), or the option browsed
     * to with F2. Unmatched text is kept for validation, as before.
     */
    if (event.key === "Tab" && isOpen && highlightedSuggestion &&
        (optionIndex !== null ||
          (query.trim() !== "" && !exactOption && highlightedSuggestion.code !== ""))) {
      acceptedOnTab.current = true;
      selectSuggestion(highlightedSuggestion);
    }

    // Other navigation never accepts a highlighted option or changes the value.
    handleCellNavigation(event);
  }

  let placeholder = "";
  // A bare ellipsis fits the narrow lookup cells (CA, OM, PY…) unclipped.
  if (isLoading && options.length === 0) placeholder = "…";
  // A failed lookup shows no "Unavailable" label in every row; the reason is
  // kept for screen readers through aria-describedby.
  else if (error && options.length === 0) placeholder = "";
  else if (options.length === 0) placeholder = isFreeEntry ? "" : "No values";

  function handleFocus() {
    acceptedOnTab.current = false;
    setOptionIndex(null);

    setQuery(toInputValue(value));
    setShowInvalidSelection(false);
    setShowAllOptions(true);
    openDropdown();
  }

  const dropdown = showSuggestions
    ? createPortal(
        <ul
          id={suggestionListId}
          className={TABLE_DROPDOWN_MENU}
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
              className={`${MENU_ITEM} cursor-pointer ${
                // The faded "Empty" option keeps its grey text when highlighted.
                suggestion.code === "" ? `hover:bg-rl-navy-soft ${DROPDOWN_MUTED}` : DROPDOWN_OPTION_HOVER
              }${
                index === highlightedIndex
                  ? ` raw-litho-lookup-suggestion--active ${suggestion.code === "" ? "bg-rl-navy-soft" : DROPDOWN_OPTION_ACTIVE}`
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
              {suggestion.code || "Empty"}
            </li>
          ))}

          {!isLoading && suggestions.length === 1 && Boolean(query.trim()) && !showAllOptions && (
            <li
              className={`${MENU_ITEM} ${DROPDOWN_MUTED}`}
              role="option"
              aria-disabled="true"
              aria-selected="false"
            >
              No matching values
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
        {...inputData}
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
        aria-description="Enter or Tab picks a value. F2 then arrow keys to browse. Escape closes the list."
        aria-expanded={showSuggestions}
        aria-controls={suggestionListId}
        aria-activedescendant={
          showSuggestions && highlightedSuggestion
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
        onClick={() => {
          // Selecting an option keeps input focus, so a later click cannot
          // rely on another focus event. Reset only when reopening the menu.
          if (!isOpen) handleFocus();
        }}
        onBlur={finishEditing}
        onKeyDown={handleKeyDown}
      />

      {!isDisabled && !isFreeEntry && (
        <span
          className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 transition-transform duration-120 ${
            isCompact ? "right-px w-[7px]" : "right-[3px] w-[9px]"
          } ${
            showSuggestions
              ? "rotate-180 text-rl-navy"
              : "text-rl-text-muted peer-hover:text-rl-navy"
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
        <span id={loadErrorId} className="sr-only">
          {error}
        </span>
      )}
    </div>
  );
}

export default LookupAutocomplete;
