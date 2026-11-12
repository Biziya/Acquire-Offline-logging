import type { ReactNode } from "react";

// Page heading used by every page.
function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="m-0 mb-1.5 shrink-0 text-[1.25rem] leading-normal font-bold text-rl-navy">
      {children}
    </h1>
  );
}

export default PageTitle;
