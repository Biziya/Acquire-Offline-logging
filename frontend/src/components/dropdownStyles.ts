/*
 * The look of every custom dropdown menu (Raw Litho lookup cells, the
 * drillhole selector on Raw Litho / Database Viewer, Upload Data lookup
 * cells). The values are the established Raw Litho menu; callers add only
 * position, z-index and size. Values only — no behaviour.
 *
 * Native `<datalist>` popups are drawn by the browser / OS (black under a
 * dark Windows theme) and cannot be styled, so lookups use these menus.
 */

// White menu surface.
export const DROPDOWN_MENU =
  "m-0 list-none overflow-y-auto rounded-ui border border-rl-border bg-white p-1 text-left shadow-popup";

// Menu anchored to a table cell, portalled to <body> so a scrolling table
// never clips it. Position and width come from useAnchoredMenuStyle.
export const TABLE_DROPDOWN_MENU = `${DROPDOWN_MENU} fixed z-[1000] max-h-[220px] max-w-[320px] min-w-[150px]`;

// One option in a table-cell menu (compact, one line).
export const TABLE_DROPDOWN_OPTION =
  "overflow-hidden rounded px-[9px] py-[7px] text-ellipsis whitespace-nowrap";

// Hover and keyboard-highlighted option.
export const DROPDOWN_OPTION_HOVER = "hover:bg-rl-navy-soft hover:text-rl-navy-dark";
export const DROPDOWN_OPTION_ACTIVE = "bg-rl-navy-soft text-rl-navy-dark";

// Faded "Empty" option and status lines ("Loading values…", "No matches").
export const DROPDOWN_MUTED = "text-rl-text-muted";
