import type { Drillhole } from "../../types/domain";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FIELD,
  FIELD_CONTROL,
  FIELD_LABEL,
  READONLY_VALUE,
} from "../../components/fieldStyles";

interface RawLithoFiltersProps {
  drillholes: Drillhole[];
  selectedHoleId: string;
  selectedDrillhole: Drillhole | null;
  isLoading: boolean;
  error: string;
  onDrillholeChange: (holeId: string) => void;
  /* Rendered at the right end of the row (Import JSON). */
  actions?: ReactNode;
}


const SUGGESTION_LIMIT = 10;
const SUGGESTION_LIST_ID = "drillhole-suggestion-list";

const FIELD_ERROR = "max-w-[220px] text-[0.8rem] text-rl-danger";
const CHEVRON = [
  "after:pointer-events-none after:absolute after:right-[11px] after:bottom-[11px]",
  "after:size-2 after:border-r-[1.6px] after:border-b-[1.6px] after:border-rl-text-muted",
  "after:-translate-y-0.5 after:rotate-45 after:content-['']",
  "after:transition-[border-color,translate,rotate] after:duration-140",
  "hover:after:border-rl-navy",
  "has-[input:focus]:after:translate-y-0.5 has-[input:focus]:after:rotate-[225deg] has-[input:focus]:after:border-rl-navy",
].join(" ");

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
  actions,
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
    placeholder = "Drillholes unavailable";
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

  // The chevron is drawn with ::after and is hidden while the clear button
  // takes its place, or while the field is disabled.
  const showClearButton = Boolean(query) && !isDisabled;
  const showChevron = !showClearButton && !isDisabled;

  return (
    <div className="mb-2 flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className={FIELD}>
        <label className={FIELD_LABEL} htmlFor="drillhole-search">
          Drillhole
        </label>

        <div
          className={`relative w-[min(260px,100%)]${showChevron ? ` ${CHEVRON}` : ""}`}
        >
          <input
            id="drillhole-search"
            className={`${FIELD_CONTROL} w-full pr-8 pl-2.5 aria-invalid:border-rl-required`}
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

          {showClearButton && (
            <button
              className="absolute top-1/2 right-2 size-6 -translate-y-1/2 cursor-pointer rounded border-0 bg-transparent p-0 text-[1.25rem] leading-none text-rl-text-muted transition-colors duration-140 hover:bg-rl-navy-soft hover:text-rl-navy focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring active:bg-[#dbe5f2]"
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
              className="absolute inset-x-0 top-[calc(100%+4px)] z-20 m-0 max-h-[260px] list-none overflow-y-auto rounded-lg border border-rl-border bg-white p-1 shadow-[0_10px_24px_rgb(16_35_61/16%)]"
              role="listbox"
            >
              {suggestions.length > 0 ? (
                suggestions.map((drillhole, index) => (
                  <li
                    id={`drillhole-option-${index}`}
                    className={`cursor-pointer rounded px-2.5 py-2 transition-colors duration-140 hover:bg-rl-navy-soft hover:text-rl-navy-dark${
                      index === activeSuggestionIndex
                        ? " raw-litho-suggestion--active bg-rl-navy-soft text-rl-navy-dark"
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
                  className="rounded px-2.5 py-2 text-rl-text-muted"
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
          <span id="drillhole-load-error" className={FIELD_ERROR}>
            {error}
          </span>
        )}
        {!error && showInvalidSelection && (
          <span id="drillhole-selection-error" className={FIELD_ERROR}>
            Select a valid drillhole
          </span>
        )}
      </div>

      <div className={FIELD}>
        <span className={FIELD_LABEL}>Project</span>
        <output className={READONLY_VALUE}>
          {selectedDrillhole?.projectCode || "—"}
        </output>
      </div>

      <div className={FIELD}>
        <span className={FIELD_LABEL}>Campaign</span>
        <output className={READONLY_VALUE}>
          {selectedDrillhole?.campaign || "—"}
        </output>
      </div>

      {actions && (
        <div className={`${FIELD} ml-auto`}>
          <span className={FIELD_LABEL}>Import</span>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
    </div>
  );
}

export default RawLithoFilters;
