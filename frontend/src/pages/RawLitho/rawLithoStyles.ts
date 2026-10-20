/*
 * Tailwind class lists used by more than one Raw Litho component. Everything
 * else is written inline where it is used.
 */

// Outline button: Import JSON, pagination, Add Row / Remove Last Row.
// Callers add the size and a disabled look (OUTLINE_BUTTON_DISABLED, or a
// plain opacity for Import JSON).
export const OUTLINE_BUTTON = [
  "cursor-pointer rounded-md border border-rl-border-strong bg-white font-[550]",
  "transition-[background-color,border-color,color,box-shadow] duration-140",
  "enabled:active:translate-y-px",
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring",
].join(" ");

export const OUTLINE_BUTTON_NAVY =
  "text-rl-navy enabled:hover:border-rl-navy enabled:hover:bg-rl-navy-soft enabled:hover:text-rl-navy-dark";

// Table cell input (plain and lookup). The cell itself draws the focus ring.
export const CELL_INPUT = [
  "h-full w-full min-w-0 border-0 bg-transparent py-px text-center text-[0.78rem] text-rl-text",
  "outline-none focus:font-[550] focus:text-[#0f172a]",
  "disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[#93a1b5]",
].join(" ");

export const OUTLINE_BUTTON_DISABLED =
  "disabled:cursor-not-allowed disabled:border-rl-border disabled:bg-rl-navy-softer disabled:text-rl-disabled";
