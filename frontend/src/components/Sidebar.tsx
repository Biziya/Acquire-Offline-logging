import { useState } from "react";
import { NavLink } from "react-router-dom";
import StatusIndicator from "./StatusIndicator";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { uiConfig } from "../config/uiConfig";

const ICON = "size-[17px] shrink-0";
// Neutral text while no trusted identity source exists (services/currentUser.ts).
const NO_USER_LABEL = "User not identified";
const LABEL = "whitespace-nowrap";

function RawLithoIcon() {
  return (
    <svg
      className={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 3h12v18H6z" />
      <path d="M6 8h12M6 14h12" />
      <path d="m9 5 2 3M14 8l2-3M8 11l3 3M14 14l3-3M9 17l2 4M14 21l2-4" />
    </svg>
  );
}

function UploadDataIcon() {
  return (
    <svg
      className={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 14v6h14v-6" />
    </svg>
  );
}

function ToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
    </svg>
  );
}

function DatabaseViewerIcon() {
  return (
    <svg
      className={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </svg>
  );
}

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  // "DOMAIN\username" from the trusted identity source, or null — never guessed.
  const currentUser = useCurrentUser();
  const userLabel = currentUser ?? NO_USER_LABEL;
  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    [
      "flex min-h-8 items-center gap-[9px] rounded-md border-0 py-[5px] text-[0.82rem] text-inherit no-underline hover:bg-[#1f2937] hover:text-white",
      collapsed ? "w-[34px] justify-center px-0" : "px-2",
      isActive ? "bg-[#1f2937] text-white" : "",
    ].join(" ");

  return (
    <aside
      className={`group/sidebar flex h-screen shrink-0 flex-col overflow-hidden bg-[#111827] text-[#e5e7eb] transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-[52px]" : "w-[178px]"
      }`}
      data-collapsed={collapsed}
    >
      <div
        className={`flex h-10 items-center py-1.5 ${
          collapsed ? "justify-center px-1.5" : "justify-between px-2"
        }`}
      >
        {!collapsed && (
          <span className="overflow-hidden text-[0.78rem] font-semibold tracking-[0.04em] text-ellipsis whitespace-nowrap text-[#9ca3af]">
            {uiConfig.appName}
          </span>
        )}
        <button
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-inherit hover:bg-[#1f2937]"
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <ToggleIcon collapsed={collapsed} />
        </button>
      </div>

      <nav
        className={`grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto px-1.5 py-1 ${
          collapsed ? "justify-items-center" : ""
        }`}
        aria-label="Main navigation"
      >
        {/* Home is hidden for now; "/" opens Raw Litho (App.tsx). */}
        <NavLink
          to="/raw-litho"
          className={linkClassName}
          aria-label={collapsed ? "Raw Litho" : undefined}
        >
          <RawLithoIcon />
          {!collapsed && <span className={LABEL}>Raw Litho</span>}
        </NavLink>

        <NavLink
          to="/database-viewer"
          className={linkClassName}
          aria-label={collapsed ? "Database Viewer" : undefined}
        >
          <DatabaseViewerIcon />
          {!collapsed && <span className={LABEL}>Database Viewer</span>}
        </NavLink>

        <NavLink
          to="/upload-data"
          className={linkClassName}
          aria-label={collapsed ? "Upload Data" : undefined}
        >
          <UploadDataIcon />
          {!collapsed && <span className={LABEL}>Upload Data</span>}
        </NavLink>
      </nav>

      {/*
        Signed-in user, a thin divider, then backend status — pinned to the
        bottom and aligned with the link icons. Collapsed, only the status
        light remains (the name is in its tooltip).
      */}
      <div
        className={`shrink-0 border-t border-[#1f2937] py-2.5 ${
          collapsed ? "px-0 text-center" : "px-3.5"
        }`}
        title={collapsed ? userLabel : undefined}
      >
        {!collapsed && (
          <>
            <p
              className={`m-0 truncate text-xs font-medium ${
                currentUser ? "text-[#e5e7eb]" : "text-[#9ca3af] italic"
              }`}
              title={userLabel}
            >
              {userLabel}
            </p>
            <hr className="my-2 border-0 border-t border-[#374151]" />
          </>
        )}
        <StatusIndicator />
      </div>
    </aside>
  );
}

export default Sidebar;
