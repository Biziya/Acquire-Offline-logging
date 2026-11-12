import { useState } from "react";
import { NavLink } from "react-router-dom";
import StatusIndicator from "./StatusIndicator";
import { useCachedWindowsIdentity } from "../hooks/useCachedWindowsIdentity";
import { uiConfig } from "../config/uiConfig";

const ICON = "size-5 shrink-0";
// Neutral text until a previously persisted identity is available.
const NO_USER_LABEL = "User not identified";
// min-w-0 + truncate: while the sidebar animates open, a label never pushes
// past its link (which would show a horizontal scrollbar).
const LABEL = "min-w-0 truncate whitespace-nowrap font-semibold";
// Light focus ring that shows on the dark sidebar.
const SIDE_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-rl-side-text";
// From package.json, set at build time (vite.config.ts).
const VERSION_LABEL = `v${__APP_VERSION__}`;

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
  // Last cached Windows identity for display; never proof of authentication.
  const currentUser = useCachedWindowsIdentity();
  const userLabel = currentUser ?? NO_USER_LABEL;
  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    [
      `flex min-h-9 items-center gap-[9px] rounded-ui border-0 py-[5px] text-[0.8125rem] text-inherit no-underline hover:bg-rl-side-hover hover:text-white ${SIDE_FOCUS}`,
      collapsed ? "w-9 justify-center px-0" : "px-2",
      isActive ? "bg-rl-side-hover text-white shadow-[inset_3px_0_0_var(--color-rl-side-online)]" : "",
    ].join(" ");

  return (
    <aside
      className={`group/sidebar flex h-screen shrink-0 flex-col overflow-hidden bg-rl-side text-rl-side-text transition-[width] duration-200 ease-in-out ${
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
          <span className="min-w-0 overflow-hidden text-[0.875rem] font-bold text-ellipsis whitespace-nowrap text-white">
            {uiConfig.appName}
          </span>
        )}
        <button
          className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-ui border-0 bg-transparent text-rl-side-muted hover:bg-rl-side-hover hover:text-white ${SIDE_FOCUS}`}
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <ToggleIcon collapsed={collapsed} />
        </button>
      </div>

      <hr className="mx-3.5 mt-0 mb-1 shrink-0 border-0 border-t border-rl-side-hover" />

      <nav
        className={`grid min-h-0 flex-1 content-start gap-0.5 overflow-x-hidden overflow-y-auto px-1.5 py-1 ${
          collapsed ? "justify-items-center" : ""
        }`}
        aria-label="Main navigation"
      >
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
        Signed-in user, server status and app version, pinned to the bottom
        and aligned with the link icons. Collapsed, only the status light
        remains (name and version are in its tooltip).
      */}
      <div
        className={`shrink-0 overflow-x-hidden py-2.5 ${
          collapsed ? "px-0 text-center" : "px-3.5"
        }`}
        title={collapsed ? `${userLabel}\n${VERSION_LABEL}` : undefined}
      >
        {!collapsed && (
          <>
            <p
              className={`m-0 truncate text-xs font-medium ${
                currentUser ? "text-rl-side-text" : "text-rl-side-muted italic"
              }`}
              title={userLabel}
            >
              {userLabel}
            </p>
            <div className="h-2" />
          </>
        )}
        <StatusIndicator />
        {!collapsed && (
          <p className="m-0 mt-1 text-[0.65rem] leading-none text-rl-side-muted/60">
            {VERSION_LABEL}
          </p>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
