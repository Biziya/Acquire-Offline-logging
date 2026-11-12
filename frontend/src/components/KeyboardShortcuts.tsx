import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DIALOG_TITLE, ICON_BUTTON } from "./uiStyles";

type Separator = "+" | "/" | "then";
type Scope = "Raw Litho" | "Upload Data";
interface Shortcut {
  keys: string[];
  description: string;
  separator?: Separator;
  // Set when a shortcut works on one page only.
  scope?: Scope;
}

// Only shortcuts the handlers implement; Database Viewer has none. Detailed
// behavior lives with the handlers (tableNavigation.ts, useRawLithoShortcuts.ts,
// LookupAutocomplete.tsx, RawLithoRow.tsx, RawLithoTable.tsx,
// RawLithoFilters.tsx, UploadDataTable.tsx).
const GROUPS: { title: string; scope?: Scope; items: Shortcut[] }[] = [
  {
    title: "Move around",
    items: [
      { keys: ["Tab"], description: "Next cell" },
      { keys: ["Shift", "Tab"], description: "Previous cell", separator: "+" },
      { keys: ["←", "→"], description: "Cell left / right at text end", separator: "/" },
      { keys: ["↑", "↓"], description: "Row above / below", separator: "/" },
      { keys: ["Enter"], description: "Row below", scope: "Upload Data" },
      { keys: ["PgUp", "PgDn"], description: "Previous / next page", separator: "/", scope: "Raw Litho" },
      { keys: ["Esc", "Tab"], description: "Leave the table", separator: "then", scope: "Raw Litho" },
    ],
  },
  {
    title: "Edit and select",
    items: [
      { keys: ["Enter"], description: "Open list / pick value", scope: "Raw Litho" },
      { keys: ["Enter"], description: "Save From / To depth", scope: "Raw Litho" },
      { keys: ["F2"], description: "Move through the list", scope: "Raw Litho" },
      { keys: ["Delete"], description: "Clear cell", scope: "Raw Litho" },
      { keys: ["Esc"], description: "Close list, clear selection" },
      { keys: ["Ctrl", "Click"], description: "Select several cells", separator: "+" },
      { keys: ["Ctrl", "C"], description: "Copy cells", separator: "+" },
      { keys: ["Ctrl", "V"], description: "Paste cells", separator: "+" },
    ],
  },
  {
    title: "Rows",
    scope: "Raw Litho",
    items: [
      { keys: ["F4"], description: "Add row" },
      { keys: ["Tab", "↓"], description: "Add row from last cell", separator: "/" },
      { keys: ["F5"], description: "Remove last row" },
    ],
  },
  {
    title: "Drillhole search",
    scope: "Raw Litho",
    items: [
      { keys: ["↑", "↓"], description: "Move through list", separator: "/" },
      { keys: ["Enter"], description: "Choose drillhole" },
      { keys: ["Esc"], description: "Close list" },
    ],
  },
];

const SEPARATOR_LABEL: Record<Separator, string> = { "+": " + ", "/": " / ", then: " then " };


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
      <button ref={triggerRef} type="button" title="Help and shortcuts"
        className={`absolute top-3 right-4 z-10 ${ICON_BUTTON}`}
        aria-label="Help and shortcuts" aria-expanded={open}
        aria-haspopup="dialog" aria-controls={open ? id : undefined}
        onClick={() => setOpen(current => !current)}>
        <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
          <path d="M12 17h.01" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={popupRef} id={id} role="dialog" aria-labelledby={`${id}-title`}
          className="fixed top-13 right-4 z-[1200] max-h-[calc(100dvh-3.75rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-ui border border-rl-border bg-white p-3 text-rl-text shadow-popup"
          onKeyDown={event => {
            // Popup keys must not reach Raw Litho's window shortcuts.
            event.stopPropagation();
          }}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 id={`${id}-title`} className={DIALOG_TITLE}>Shortcuts</h2>
            <button ref={closeRef} type="button" className={ICON_BUTTON} aria-label="Close shortcuts" onClick={close}>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          {GROUPS.map(group => <section key={group.title} className="border-t border-rl-border pt-1.5 mt-1.5 first-of-type:mt-0">
            <h3 className="m-0 mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-rl-navy">
              {group.title}
              {group.scope && <span className="font-normal text-rl-text-muted">{group.scope} only</span>}
            </h3>
            <dl className="m-0 grid gap-0.5 text-xs">
              {group.items.map(({ keys, description, separator, scope }) => <div key={`${keys.join()} ${description}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
                <dt className="flex items-center gap-1 whitespace-nowrap" aria-label={keys.join(separator ? SEPARATOR_LABEL[separator] : " ")}>
                  {keys.map((key, index) => <span key={key} className="inline-flex items-center gap-1">
                    {separator && index > 0 && <span aria-hidden="true" className="text-rl-text-muted">{separator}</span>}
                    <kbd className="rounded-ui border border-rl-border bg-rl-navy-softer px-1 font-sans text-xs leading-[1.125rem]">{key}</kbd>
                  </span>)}
                </dt>
                <dd className="m-0 flex min-w-0 items-center gap-2 leading-5">
                  <span className="truncate" title={description}>{description}</span>
                  {scope && <span className="ml-auto shrink-0 text-rl-text-muted">{scope}</span>}
                </dd>
              </div>)}
            </dl>
          </section>)}
        </div>, document.body,
      )}
    </>
  );
}
