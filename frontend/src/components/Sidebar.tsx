import { useState } from "react";
import { NavLink } from "react-router-dom";
import StatusIndicator from "./StatusIndicator";
import "../css/Sidebar.css";

function HomeIcon() {
  return (
    <svg
      className="sidebar-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
    </svg>
  );
}

function RawLithoIcon() {
  return (
    <svg
      className="sidebar-icon"
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
      className="sidebar-icon"
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
      className="sidebar-icon"
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

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `sidebar-link${isActive ? " sidebar-link-active" : ""}`;

  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
      <div className="sidebar-header">
        {!collapsed && <span className="sidebar-label">Navigation of WEB</span>}
        <button
          className="sidebar-toggle"
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <ToggleIcon collapsed={collapsed} />
        </button>
      </div>

      <nav className="sidebar-menu" aria-label="Main navigation">
        <NavLink
          to="/"
          end
          className={linkClassName}
          aria-label={collapsed ? "Home" : undefined}
        >
          <HomeIcon />
          {!collapsed && <span className="sidebar-label">Home</span>}
        </NavLink>

        <NavLink
          to="/raw-litho"
          className={linkClassName}
          aria-label={collapsed ? "Raw Litho" : undefined}
        >
          <RawLithoIcon />
          {!collapsed && <span className="sidebar-label">Raw Litho</span>}
        </NavLink>

        <NavLink
          to="/upload-data"
          className={linkClassName}
          aria-label={collapsed ? "Upload Data" : undefined}
        >
          <UploadDataIcon />
          {!collapsed && <span className="sidebar-label">Upload Data</span>}
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <StatusIndicator />
      </div>
    </aside>
  );
}

export default Sidebar;
