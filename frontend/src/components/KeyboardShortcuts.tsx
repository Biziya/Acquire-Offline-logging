import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Separator = "+" | "/" | "then";
interface Shortcut {
  keys: string[];
  description: string;
  separator?: Separator;
  // Set when a shortcut works on one page only.
  scope?: "Raw Litho" | "Upload Data";
}

// Only shortcuts the handlers implement; Database Viewer has none. Detailed
// behavior lives with the handlers (tableNavigation.ts, useRawLithoShortcuts.ts,
// LookupAutocomplete.tsx, RawLithoTable.tsx, UploadDataTable.tsx).
const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: "Table navigation",
    items: [
      { keys: ["Tab"], description: "Next cell" },
      { keys: ["Shift", "Tab"], description: "Previous cell", separator: "+" },
      { keys: ["←", "→"], description: "Previous / next cell at text edge", separator: "/" },
      { keys: ["↑", "↓"], description: "Previous / next row", separator: "/" },
      { keys: ["Enter"], description: "Next row", scope: "Upload Data" },
      { keys: ["PgUp", "PgDn"], description: "Previous / next page", separator: "/", scope: "Raw Litho" },
      { keys: ["Esc", "Tab"], description: "Leave the table", separator: "then", scope: "Raw Litho" },
    ],
  },
  {
    title: "Editing and selection",
    items: [
      { keys: ["Enter"], description: "Open list / confirm value", scope: "Raw Litho" },
      { keys: ["F2"], description: "Browse list with ↑ ↓", scope: "Raw Litho" },
      { keys: ["Esc"], description: "Close list, clear selection" },
      { keys: ["Delete"], description: "Clear cell", scope: "Raw Litho" },
      { keys: ["Ctrl", "Click"], description: "Select multiple cells", separator: "+" },
      { keys: ["Ctrl", "C"], description: "Copy", separator: "+" },
      { keys: ["Ctrl", "V"], description: "Paste", separator: "+" },
    ],
  },
  {
    title: "Rows",
    items: [
      { keys: ["F4"], description: "Add row", scope: "Raw Litho" },
      { keys: ["Tab", "↓"], description: "Add row from the last cell", separator: "/", scope: "Raw Litho" },
      { keys: ["F5"], description: "Remove last row", scope: "Raw Litho" },
    ],
  },
];

const SEPARATOR_LABEL: Record<Separator, string> = { "+": " + ", "/": " / ", then: " then " };

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
          className="fixed top-11 right-4 z-[1200] max-h-[calc(100dvh-3.75rem)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-ui border border-rl-border bg-white p-3 text-rl-text shadow-[0_10px_24px_rgb(16_35_61/16%)]"
          onKeyDown={event => {
            // Popup keys must not reach Raw Litho's window shortcuts.
            event.stopPropagation();
          }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id={`${id}-title`} className="m-0 text-sm font-semibold text-rl-navy">Keyboard shortcuts</h2>
            <button ref={closeRef} type="button" className={ICON_BUTTON} aria-label="Close keyboard shortcuts" onClick={close}>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <p className="m-0 mb-3 text-xs text-rl-text-muted">Raw Litho and Upload Data tables</p>
          <div className="grid gap-3">
            {GROUPS.map(group => <section key={group.title}>
              <h3 className="m-0 mb-2 text-xs font-semibold text-rl-navy">{group.title}</h3>
              <dl className="m-0 grid gap-2 text-xs">
                {group.items.map(({ keys, description, separator, scope }) => <div key={`${keys.join()} ${description}`} className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2">
                  <dt className="flex flex-wrap items-center gap-1" aria-label={keys.join(separator ? SEPARATOR_LABEL[separator] : " ")}>
                    {keys.map((key, index) => <span key={key} className="inline-flex items-center gap-1">
                      {separator && index > 0 && <span aria-hidden="true" className="text-rl-text-muted">{separator}</span>}
                      <kbd className="rounded-ui border border-rl-border bg-rl-navy-softer px-1 py-0.5 font-sans text-xs">{key}</kbd>
                    </span>)}
                  </dt>
                  <dd className="m-0 leading-relaxed">
                    {description}
                    {scope && <span className="ml-1 text-rl-text-muted">· {scope}</span>}
                  </dd>
                </div>)}
              </dl>
            </section>)}
          </div>
        </div>, document.body,
      )}
    </>
  );
}
