/*
 * Tailwind class lists shared by the Upload Data sections. Everything else is
 * written inline where it is used.
 */
export const SECTION =
  "rounded-xl border border-[#dce3ed] bg-white p-[22px] shadow-[0_2px_8px_rgb(23_32_51/5%)] max-[680px]:px-3.5 max-[680px]:py-[18px]";
export const SECTION_HEADING = "mb-[18px] flex items-start gap-3.5";
export const STEP_NUMBER =
  "grid size-[30px] flex-none place-items-center rounded-full bg-[#eaf1ff] font-bold text-[#245fc5]";
export const SECTION_TITLE = "m-0 mb-1 text-[1.1rem] font-bold";
export const SECTION_TEXT = "m-0 text-[0.9rem] leading-[1.45] text-[#738095]";

const BUTTON =
  "min-h-10 cursor-pointer rounded-[7px] border px-4 py-[9px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#cbd5e1] disabled:text-[#64748b] disabled:opacity-80";
export const BUTTON_SECONDARY = `${BUTTON} border-[#cbd5e1] bg-white text-[#27364d] enabled:hover:bg-[#f8fafc]`;
export const BUTTON_PRIMARY = `${BUTTON} border-transparent bg-[#2563eb] text-white enabled:hover:bg-[#1d4ed8]`;
// Small square "×" next to a value (Remove selected file); same focus ring and
// disabled look as the buttons above.
export const ICON_BUTTON =
  "grid size-7 flex-none cursor-pointer place-items-center rounded-md border border-[#cbd5e1] bg-white p-0 text-[1.1rem] leading-none text-[#475569] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] enabled:hover:border-[#b42318] enabled:hover:bg-[#fef3f2] enabled:hover:text-[#b42318] disabled:cursor-not-allowed disabled:opacity-50";
