/*
 * Shared design roles for every page (Raw Litho, Database Viewer, Upload
 * Data, Access denied). Colours are the rl-* tokens in css/index.css. Related
 * roles live next door: PageTitle.tsx (main page title), fieldStyles.ts
 * (field label, input, select) and dataTableStyles.ts (tables).
 *
 * Every button in the app is one of: PRIMARY_BUTTON, SECONDARY_BUTTON,
 * DANGER_BUTTON, SMALL_BUTTON or ICON_BUTTON. Add sizes or widths to them,
 * never new colours.
 */

// Heading of a block inside a page ("Database records", "File").
export const SECTION_TITLE = "m-0 text-[0.9375rem] font-semibold text-rl-text";

// Muted secondary text: descriptions, record counts, status lines.
export const HELPER_TEXT = "m-0 text-[0.8125rem] text-rl-text-muted";

// Heading of a dialog or popup.
export const DIALOG_TITLE = "m-0 text-base font-bold text-rl-navy";

// White bordered surface: table frames and Upload Data's sections.
export const PANEL = "rounded-ui border border-rl-border bg-white shadow-ui";

// Keyboard focus, the same on every control.
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring";

/*
 * Outline button base. Callers add the size, a colour (OUTLINE_BUTTON_NAVY)
 * and a disabled look; prefer the finished buttons below.
 */
export const OUTLINE_BUTTON = [
  "cursor-pointer rounded-ui border border-rl-border-strong bg-white font-semibold",
  "transition-colors duration-150 enabled:active:translate-y-px",
  FOCUS_RING,
].join(" ");

export const OUTLINE_BUTTON_NAVY =
  "text-rl-navy enabled:hover:border-rl-navy enabled:hover:bg-rl-navy-soft";

export const OUTLINE_BUTTON_DISABLED =
  "disabled:cursor-not-allowed disabled:border-rl-border disabled:bg-rl-navy-softer disabled:text-rl-disabled";

const ACTION_SIZE = "h-8 text-[0.8125rem]";

// Outline navy: Cancel, Import JSON, pagination, Add row.
export const SECONDARY_BUTTON = `${OUTLINE_BUTTON} ${OUTLINE_BUTTON_NAVY} ${OUTLINE_BUTTON_DISABLED} ${ACTION_SIZE} px-3`;

// The one filled button of a page or dialog: Save JSON, Upload, Import.
export const PRIMARY_BUTTON = [
  `${ACTION_SIZE} cursor-pointer rounded-ui border border-transparent bg-rl-navy px-4 font-semibold text-white`,
  "transition-colors duration-150",
  FOCUS_RING,
  "enabled:hover:bg-rl-navy-dark enabled:active:translate-y-px enabled:active:bg-rl-navy-darker",
  "disabled:cursor-not-allowed disabled:opacity-55",
].join(" ");

// Outline red: actions that remove data (Remove last row).
export const DANGER_BUTTON = [
  `${OUTLINE_BUTTON} ${OUTLINE_BUTTON_DISABLED} ${ACTION_SIZE} px-3`,
  "text-rl-danger enabled:hover:border-rl-danger enabled:hover:bg-rl-danger-soft",
].join(" ");

// Filled red: the confirm button of a dialog that removes data.
export const DANGER_FILLED_BUTTON = [
  `${ACTION_SIZE} cursor-pointer rounded-ui border border-transparent bg-rl-danger px-4 font-semibold text-white`,
  "transition-colors duration-150",
  FOCUS_RING,
  "enabled:hover:bg-rl-danger-dark enabled:active:translate-y-px",
  "disabled:cursor-not-allowed disabled:opacity-55",
].join(" ");

// Small outline button inside a line of text (Retry).
export const SMALL_BUTTON = `${OUTLINE_BUTTON} ${OUTLINE_BUTTON_NAVY} h-7 px-2.5 text-[0.75rem]`;

// Square icon-only button (help, close, remove file). Needs an aria-label.
export const ICON_BUTTON = [
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-ui border border-rl-border-strong bg-white text-rl-navy",
  "transition-colors duration-150 hover:bg-rl-navy-soft",
  FOCUS_RING,
].join(" ");
