/*
 * Tailwind class lists used by more than one Raw Litho component. Everything
 * else is written inline where it is used. Buttons and other roles shared
 * with the other pages live in components/uiStyles.ts.
 */

// Table cell input (plain and lookup). The cell itself draws the focus ring.
export const CELL_INPUT = [
  "h-full w-full min-w-0 border-0 bg-transparent py-px text-center text-[0.78rem] text-rl-text",
  "outline-none focus:font-[550] focus:text-[#0f172a]",
  "disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[#93a1b5]",
].join(" ");
