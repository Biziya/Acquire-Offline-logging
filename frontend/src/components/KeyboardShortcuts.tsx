import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Document the implemented handlers, including their page-specific limits.
const GROUPS = [
  {
    title: "Table navigation · Raw Litho / Upload Data",
    items: [
      [["Tab"], "Next editable cell"],
      [["Shift", "Tab"], "Previous editable cell"],
      [["↑"], "Previous row, same column"],
      [["↓"], "Next row, same column"],
      [["←"], "Previous editable cell at the text edge"],
      [["→"], "Next editable cell at the text edge"],
    ],
    note: "Raw Litho also navigates when the whole value is selected. Tab at the final cell or Down on the final row adds a row after validation. Upload Data never adds rows this way.",
  },
  {
    title: "Cell editing · Raw Litho",
    items: [
      [["Enter"], "Confirm a lookup choice; commit and sort a depth edit"],
      [["F2"], "Enter lookup option-selection mode"],
      [["↑", "/", "↓"], "Browse options after F2; Enter confirms"],
      [["Escape"], "Cancel lookup text and close its menu; clear cell selection"],
      [["Delete"], "Clear a cell when its value is selected, empty, or the caret is at the end"],
    ],
    note: "Tab and table arrows never accept highlighted suggestions. Click inside text or partially select it for normal caret editing.",
  },
  {
    title: "Rows and pages · Raw Litho",
    items: [
      [["F4"], "Add a row after validation"],
      [["F5"], "Open confirmation to remove the last row (replaces browser refresh here)"],
      [["PageUp"], "Previous table page"],
      [["PageDown"], "Next table page"],
    ],
  },
  {
    title: "Selection and clipboard · Raw Litho / Upload Data",
    items: [
      [["Ctrl", "Click"], "Toggle a cell in the multi-cell selection"],
      [["Ctrl", "C"], "Copy selected cells"],
      [["Ctrl", "V"], "Paste into selected cells or paste a block from the focused cell"],
      [["Escape"], "Clear the cell selection"],
    ],
    note: "Use Command instead of Ctrl on macOS. Without a cell selection, ordinary text copy/paste remains available. Upload Data Enter moves to the next row in the same column.",
  },
  {
    title: "Drillhole chooser · Raw Litho / Database Viewer",
    items: [
      [["↑", "/", "↓"], "Browse drillhole suggestions"],
      [["Enter"], "Choose the highlighted drillhole"],
      [["Escape"], "Close suggestions"],
    ],
  },
  {
    title: "Buttons and dialogs",
    items: [
      [["Tab"], "Focus the next control (Shift + Tab goes back)"],
      [["Enter", "/", "Space"], "Activate a focused button"],
      [["Escape"], "Cancel a confirmation when not busy; close this popup"],
    ],
    note: "Database Viewer data is read-only. Alt + Tab remains the Windows application-switching shortcut.",
  },
] satisfies { title: string; items: [string[], string][]; note?: string }[];

const ICON_BUTTON = "grid size-7 shrink-0 cursor-pointer place-items-center rounded-ui border border-rl-border-strong bg-white text-rl-navy hover:bg-rl-navy-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-cell-ring";

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function outside(event: PointerEvent) {
      if (event.target instanceof Node &&
          !popupRef.current?.contains(event.target) &&
          !triggerRef.current?.contains(event.target)) {
        // Leave focus with the control the user is clicking.
        setOpen(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" title="Keyboard shortcuts"
        className={`absolute top-1.5 right-4 z-10 ${ICON_BUTTON}`}
        aria-label="Keyboard shortcuts" aria-expanded={open}
        aria-haspopup="dialog" aria-controls={open ? id : undefined}
        onClick={() => setOpen(current => !current)}>
        <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M5 9h2m3 0h2m3 0h2m2 0h1M5 12h2m3 0h2m3 0h2m2 0h1M6 16h12" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={popupRef} id={id} role="dialog" aria-labelledby={`${id}-title`}
          className="fixed top-11 right-4 z-[1200] max-h-[calc(100dvh-3.75rem)] w-[min(25rem,calc(100vw-2rem))] overflow-y-auto rounded-ui border border-rl-border bg-white p-4 text-rl-text shadow-[0_10px_24px_rgb(16_35_61/16%)]"
          onKeyDown={event => {
            // Popup keys must not reach Raw Litho's window shortcuts.
            event.stopPropagation();
          }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id={`${id}-title`} className="m-0 text-sm font-semibold text-rl-navy">Keyboard shortcuts</h2>
            <button ref={closeRef} type="button" className={ICON_BUTTON} aria-label="Close keyboard shortcuts" onClick={close}>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="grid gap-4">
            {GROUPS.map(group => <section key={group.title}>
              <h3 className="m-0 mb-2 text-xs font-semibold text-rl-navy">{group.title}</h3>
              <dl className="m-0 grid gap-2 text-xs">
                {group.items.map(([keys, description]) => <div key={description} className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2">
                  <dt className="flex flex-wrap items-center gap-1">
                    {keys.map((key, index) => key === "/" ? <span key={index}>/</span> : <kbd key={index} className="rounded-ui border border-rl-border bg-rl-navy-softer px-1.5 py-0.5 font-sans text-[0.68rem]">{key}</kbd>)}
                  </dt>
                  <dd className="m-0 leading-relaxed">{description}</dd>
                </div>)}
              </dl>
              {group.note && <p className="m-0 mt-2 text-[0.7rem] leading-relaxed text-rl-text-muted">{group.note}</p>}
            </section>)}
          </div>
        </div>, document.body,
      )}
    </>
  );
}
