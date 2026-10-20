import type { LookupDefinition, LookupRecord } from "../../types/domain";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  handleArrowNavigation,
  isClearCellRequest,
  isNavigationFocus,
  markKeyAsHandled,
  moveFocusHorizontally,
} from "./tableNavigation";

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
   * Fast accept. While the user is searching, ArrowRight / ArrowLeft take the
   * highlighted closest match, close the list and move one cell right / left,
   * so a partially typed code never has to be finished by hand.
   *
   * It only fires when there is something valid to accept, so a query with no
   * match can never write a wrong value into the cell. A cell the user has not
   * typed into is left to `handleArrowNavigation`, which keeps the ordinary
   * caret-edge behaviour for reading and editing an existing value.
   */
  function acceptClosestMatch(event: React.KeyboardEvent<HTMLInputElement>) {
    if (hasModifier(event)) return false;
    if (!isSearching.current || !showSuggestions) return false;
    if (!query.trim() || !highlightedSuggestion) return false;

    event.preventDefault();
    markKeyAsHandled(event);
    selectSuggestion(highlightedSuggestion);

    isAcceptingMatch.current = true;
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

    if (event.key === "Tab") {
      finishEditing();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (acceptClosestMatch(event)) return;

      handleArrowNavigation(event);
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
      handleArrowNavigation(event);
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
          className="raw-litho-lookup-suggestions"
          role="listbox"
          style={menuStyle}
        >
          {isLoading && options.length === 0 && (
            <li className="raw-litho-lookup-status" role="status">
              Loading values…
            </li>
          )}

          {suggestions.map((suggestion, index) => (
            <li
              id={`${suggestionListId}-option-${index}`}
              className={`raw-litho-lookup-suggestion${
                index === highlightedIndex
                  ? " raw-litho-lookup-suggestion--active"
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
              className="raw-litho-lookup-empty"
              role="option"
              aria-disabled="true"
              aria-selected="false"
            >
              {error || "No matching values"}
            </li>
          )}

          {isLoading && options.length > 0 && (
            <li className="raw-litho-lookup-status" role="status">
              Refreshing values…
            </li>
          )}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div
      className={`raw-litho-lookup-autocomplete${
        isCompact ? " raw-litho-lookup-autocomplete--compact" : ""
      }`}
    >
      <input
        ref={inputRef}
        className={`raw-litho-input raw-litho-lookup-input${
          isCompact ? " raw-litho-input--compact" : ""
        }`}
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
          className="raw-litho-lookup-chevron"
          aria-hidden="true"
          data-open={showSuggestions ? "true" : "false"}
        >
          <svg viewBox="0 0 10 6" focusable="false">
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
        <span id={validationId} className="raw-litho-lookup-error">
          Select a valid value
        </span>
      )}

      {error && options.length === 0 && (
        <span id={loadErrorId} className="raw-litho-lookup-error" role="status">
          {error}
        </span>
      )}
    </div>
  );
}

export default LookupAutocomplete;
