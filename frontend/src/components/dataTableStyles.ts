/*
 * The look of every data table (Raw Litho, Upload Data, Database Viewer), so
 * the three pages cannot drift apart. Values only — no behaviour.
 */

// Scroll frame around the table: vertical scrolling, sticky header inside.
export const TABLE_FRAME =
  "min-h-0 w-full max-w-full flex-1 overflow-auto rounded-xl border border-rl-border bg-white shadow-[0_1px_2px_rgb(16_35_61/6%)]";

export const TABLE = "w-full table-fixed border-collapse bg-white";

// Sticky header cell. The inset shadows redraw the grid lines, which
// `border-collapse` would otherwise lose while the header floats over rows.
export const HEADER_CELL = [
  "sticky top-0 z-[3] border border-rl-grid bg-rl-navy-softer p-[3px] text-center",
  "text-[0.7rem] leading-[1.1] font-semibold tracking-[0.01em] whitespace-normal",
  "text-rl-text [overflow-wrap:anywhere]",
  "shadow-[inset_1px_0_0_var(--color-rl-grid),inset_-1px_0_0_var(--color-rl-grid),inset_0_1px_0_var(--color-rl-grid),inset_0_-1px_0_var(--color-rl-border-strong)]",
].join(" ");

export const BODY_CELL = "border border-rl-grid p-0 text-center text-[0.78rem]";

// Zebra rows with the navy hover tint; `index` is the 0-based display row.
export function bodyRowClass(index: number) {
  return `${index % 2 === 1 ? "bg-[#f9fbfd]" : "bg-white"} hover:bg-rl-navy-soft`;
}

/*
 * Column widths as percentages of the table, from the configured widths.
 *
 * The configured widths are proportions, not fixed pixels: together they fill
 * the table, so the columns keep their relative sizes and every column stays
 * visible at any content width. The table's `minWidth` is only a readability
 * floor, below which the table scrolls inside its own frame.
 */
export function toPercentWidths(widths: readonly number[]) {
  const total = widths.reduce((sum, width) => sum + width, 0);

  return widths.map((width) => `${((width / total) * 100).toFixed(3)}%`);
}
