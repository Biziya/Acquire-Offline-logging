import { PANEL } from "../../components/uiStyles";

/*
 * Tailwind class lists shared by the Upload Data sections. Titles, helper
 * text and buttons come from components/uiStyles.ts so this page matches Raw
 * Litho and Database Viewer; only the section frame and step badge are local.
 */
export const SECTION = `${PANEL} p-3`;
export const SECTION_HEADING = "mb-2.5 flex items-start gap-2";
export const SECTION_HEADING_TEXT = "grid gap-0.5";
export const STEP_NUMBER =
  "grid size-5 flex-none place-items-center rounded-ui bg-rl-navy-soft text-[0.75rem] font-semibold text-rl-navy";

// Square remove (X) button next to the file name: outline look, danger hover.
export const REMOVE_BUTTON =
  "grid size-8 flex-none cursor-pointer place-items-center rounded-ui border border-rl-border-strong bg-white p-0 text-rl-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring enabled:hover:border-rl-danger enabled:hover:bg-rl-danger-soft enabled:hover:text-rl-danger disabled:cursor-not-allowed disabled:opacity-55";
