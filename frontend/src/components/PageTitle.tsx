import type { ReactNode } from "react";

/*
 * The one main-page title style (Raw Litho, Database Viewer, Upload Data).
 * App.tsx reserves room on the right of every h1 for the keyboard shortcuts
 * button, so the title and the button share one row on every page.
 */
function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="m-0 mb-1.5 shrink-0 text-[1.25rem] leading-normal font-bold text-rl-navy">
      {children}
    </h1>
  );
}

export default PageTitle;
