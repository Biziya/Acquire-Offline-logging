import type { Drillhole } from "../../types/domain";
import { useEffect, useMemo, useState } from "react";

interface RawLithoFiltersProps {
  drillholes: Drillhole[];
  selectedHoleId: string;
  selectedDrillhole: Drillhole | null;
  isLoading: boolean;
  error: string;
  onDrillholeChange: (holeId: string) => void;
}


const SUGGESTION_LIMIT = 10;
const SUGGESTION_LIST_ID = "drillhole-suggestion-list";

function getMatchRank(holeId: string, normalizedQuery: string) {
  const normalizedHoleId = holeId.toLocaleLowerCase();

  if (normalizedHoleId === normalizedQuery) {
    return 0;
  }

  if (normalizedHoleId.startsWith(normalizedQuery)) {
    return 1;
  }

  if (normalizedHoleId.includes(normalizedQuery)) {
    return 2;
  }

  return null;
}

function RawLithoFilters({
  drillholes,
  selectedHoleId,
  selectedDrillhole,
  isLoading,
  error,
  onDrillholeChange,
}: RawLithoFiltersProps) {
  const [query, setQuery] = useState("");
  const [isSuggestionListOpen, setIsSuggestionListOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [showInvalidSelection, setShowInvalidSelection] = useState(false);

  const isDisabled = isLoading || Boolean(error) || drillholes.length === 0;
  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return drillholes;
    }

    return drillholes
      .map((drillhole) => ({
        drillhole,
        rank: getMatchRank(drillhole.holeId, normalizedQuery),
      }))
      .filter((entry): entry is { drillhole: Drillhole; rank: number } => entry.rank !== null)
      .sort(
        (first, second) =>
          first.rank - second.rank ||
          first.drillhole.holeId.localeCompare(second.drillhole.holeId),
      )
      .slice(0, SUGGESTION_LIMIT)
      .map((result) => result.drillhole);
  }, [drillholes, query]);

  useEffect(() => {
    setQuery(selectedHoleId ?? "");
    setShowInvalidSelection(false);
  }, [selectedHoleId]);

  let placeholder = "Search Drillhole";

  if (isLoading) {
    placeholder = "Loading drillholes...";
  } else if (error) {
    placeholder = "Drillhole data is unavailable";
  } else if (drillholes.length === 0) {
    placeholder = "No drillholes available";
  }

  function selectSuggestion(drillhole: Drillhole) {
    setQuery(drillhole.holeId);
    setIsSuggestionListOpen(false);
    setActiveSuggestionIndex(-1);
    setShowInvalidSelection(false);

    if (drillhole.holeId !== selectedHoleId) {
      onDrillholeChange(drillhole.holeId);
    }
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextQuery = event.target.value;

    setQuery(nextQuery);
    setIsSuggestionListOpen(true);
    setActiveSuggestionIndex(0);
    setShowInvalidSelection(false);

    if (selectedHoleId && nextQuery !== selectedHoleId) {
      onDrillholeChange("");
    }
  }

  function clearSelection() {
    setQuery("");
    setIsSuggestionListOpen(true);
    setActiveSuggestionIndex(drillholes.length > 0 ? 0 : -1);
    setShowInvalidSelection(false);

    if (selectedHoleId) {
      onDrillholeChange("");
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsSuggestionListOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsSuggestionListOpen(true);

      if (suggestions.length === 0) {
        setActiveSuggestionIndex(-1);
        return;
      }

      setActiveSuggestionIndex((currentIndex) => {
        if (event.key === "ArrowDown") {
          return currentIndex < suggestions.length - 1 ? currentIndex + 1 : 0;
        }

        return currentIndex > 0 ? currentIndex - 1 : suggestions.length - 1;
      });
      return;
    }

    if (event.key === "Enter" && isSuggestionListOpen) {
      const activeSuggestion = suggestions[activeSuggestionIndex];

      if (activeSuggestion) {
        event.preventDefault();
        selectSuggestion(activeSuggestion);
      }
    }
  }

  const showSuggestionList = isSuggestionListOpen && !isDisabled;
  let validationMessageId;

  if (error) {
    validationMessageId = "drillhole-load-error";
  } else if (showInvalidSelection) {
    validationMessageId = "drillhole-selection-error";
  }

  return (
    <div className="raw-litho-filters">
      <div className="raw-litho-field">
        <label className="raw-litho-label" htmlFor="drillhole-search">
          Drillhole
        </label>

        <div className="raw-litho-autocomplete">
          <input
            id="drillhole-search"
            className="raw-litho-autocomplete-input"
            type="text"
            role="combobox"
            value={query}
            placeholder={placeholder}
            autoComplete="off"
            disabled={isDisabled}
            aria-autocomplete="list"
            aria-expanded={showSuggestionList}
            aria-controls={SUGGESTION_LIST_ID}
            aria-activedescendant={
              activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]
                ? `drillhole-option-${activeSuggestionIndex}`
                : undefined
            }
            aria-describedby={validationMessageId}
            aria-invalid={showInvalidSelection || Boolean(error)}
            onChange={handleQueryChange}
            onFocus={() => {
              setIsSuggestionListOpen(true);
              setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
            }}
            onBlur={() => {
              setIsSuggestionListOpen(false);
              setShowInvalidSelection(Boolean(query) && !selectedHoleId);
            }}
            onKeyDown={handleKeyDown}
          />

          {query && !isDisabled && (
            <button
              className="raw-litho-autocomplete-clear"
              type="button"
              aria-label="Clear Drillhole"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearSelection}
            >
              ×
            </button>
          )}

          {showSuggestionList && (
            <ul
              id={SUGGESTION_LIST_ID}
              className="raw-litho-suggestions"
              role="listbox"
            >
              {suggestions.length > 0 ? (
                suggestions.map((drillhole, index) => (
                  <li
                    id={`drillhole-option-${index}`}
                    className={`raw-litho-suggestion${
                      index === activeSuggestionIndex
                        ? " raw-litho-suggestion--active"
                        : ""
                    }`}
                    key={drillhole.holeId}
                    role="option"
                    aria-selected={drillhole.holeId === selectedHoleId}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectSuggestion(drillhole);
                    }}
                  >
                    {drillhole.holeId}
                  </li>
                ))
              ) : (
                <li
                  className="raw-litho-no-suggestions"
                  role="option"
                  aria-disabled="true"
                  aria-selected="false"
                >
                  No matching drillholes
                </li>
              )}
            </ul>
          )}
        </div>

        {error && (
          <span id="drillhole-load-error" className="raw-litho-field-error">
            {error}
          </span>
        )}
        {!error && showInvalidSelection && (
          <span
            id="drillhole-selection-error"
            className="raw-litho-field-error"
          >
            Select a valid drillhole
          </span>
        )}
      </div>

      <div className="raw-litho-field">
        <span className="raw-litho-label">Project</span>
        <output className="raw-litho-readonly-value">
          {selectedDrillhole?.projectCode || "—"}
        </output>
      </div>

      <div className="raw-litho-field">
        <span className="raw-litho-label">Campaign</span>
        <output className="raw-litho-readonly-value">
          {selectedDrillhole?.campaign || "—"}
        </output>
      </div>
    </div>
  );
}

export default RawLithoFilters;
