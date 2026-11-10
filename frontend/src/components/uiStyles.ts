/*
 * Shared design roles for every page (Raw Litho, Database Viewer, Upload
 * Data). The values are the established Raw Litho / Database Viewer look and
 * the colours are the rl-* tokens in css/index.css. Related roles live next
 * door: PageTitle.tsx (main page title), fieldStyles.ts (field label, input,
 * select) and dataTableStyles.ts (tables).
 */

// Heading of a block inside a page ("Database Records", "File Selection").
export const SECTION_TITLE = "m-0 text-[0.85rem] font-semibold text-rl-text";

// Muted secondary text: descriptions, record counts, status lines.
export const HELPER_TEXT = "m-0 text-[0.8rem] text-rl-text-muted";

// Heading of a dialog or popup.
export const DIALOG_TITLE = "m-0 text-base font-[650] tracking-[-0.01em] text-rl-navy";

// White bordered surface: table frames and Upload Data's sections.
export const PANEL =
  "rounded-ui border border-rl-border bg-white shadow-[0_1px_2px_rgb(16_35_61/6%)]";

/*
 * Outline button (Import JSON, pagination, Add Row, Cancel). Callers add the
 * size, a colour (OUTLINE_BUTTON_NAVY) and a disabled look.
 */
export const OUTLINE_BUTTON = [
  "cursor-pointer rounded-ui border border-rl-border-strong bg-white font-[550]",
  "transition-[background-color,border-color,color,box-shadow] duration-140",
  "enabled:active:translate-y-px",
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring",
].join(" ");

export const OUTLINE_BUTTON_NAVY =
  "text-rl-navy enabled:hover:border-rl-navy enabled:hover:bg-rl-navy-soft enabled:hover:text-rl-navy-dark";

export const OUTLINE_BUTTON_DISABLED =
  "disabled:cursor-not-allowed disabled:border-rl-border disabled:bg-rl-navy-softer disabled:text-rl-disabled";

// Page action buttons: one filled primary (Save JSON, Upload to Database) and
// outline secondaries beside it, all the same height and text size.
const ACTION_SIZE = "h-8 text-[0.8rem]";

export const SECONDARY_BUTTON = `${OUTLINE_BUTTON} ${OUTLINE_BUTTON_NAVY} ${OUTLINE_BUTTON_DISABLED} ${ACTION_SIZE} px-3`;

export const PRIMARY_BUTTON = [
  `${ACTION_SIZE} cursor-pointer rounded-ui border border-transparent bg-rl-navy px-5 font-semibold text-white`,
  "transition-[background-color,box-shadow] duration-140",
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring",
  "enabled:hover:bg-rl-navy-dark enabled:hover:shadow-[0_2px_6px_rgb(16_35_61/22%)]",
  "enabled:active:translate-y-px enabled:active:bg-rl-navy-darker enabled:active:shadow-none",
  "disabled:cursor-not-allowed disabled:opacity-55",
].join(" ");
