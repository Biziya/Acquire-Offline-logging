/*
 * Labelled fields above the data tables (Raw Litho's drillhole search,
 * Database Viewer's drillhole selector, the read-only Project / Campaign
 * values), so the pages share one look.
 */

export const FIELD = "grid min-w-0 gap-[3px]";
export const FIELD_LABEL = "text-[0.75rem] font-semibold text-rl-text-muted";

// Text input or select. Callers add width and horizontal padding.
export const FIELD_CONTROL = [
  "h-[30px] rounded-md border border-rl-border-strong bg-white text-[0.8333rem] text-rl-text",
  "transition-[background-color,border-color,box-shadow] duration-140",
  "focus:border-rl-navy focus:shadow-[0_0_0_3px_var(--color-rl-ring-glow)] focus:outline-none",
  "enabled:hover:border-rl-navy enabled:hover:bg-rl-navy-softer enabled:active:bg-rl-navy-soft",
  "disabled:cursor-not-allowed disabled:opacity-55",
].join(" ");

export const READONLY_VALUE =
  "flex h-[30px] min-w-[min(150px,100%)] items-center rounded-md border border-rl-border bg-rl-navy-softer px-2 text-rl-text";
