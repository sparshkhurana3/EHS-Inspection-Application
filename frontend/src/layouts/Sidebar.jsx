import {
  NavLink,
} from "react-router-dom";

import {
  useAuthenticatedUser,
} from "../app/authProvider.jsx";

import {
  canPlanAudits,
} from "../constants/roles.js";

const NAVIGATION_ITEMS = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: "D",
  },
  {
    label: "Observation",
    path: "/observations",
    icon: "O",
  },
  {
    label: "Closure",
    path: "/closures",
    icon: "C",
  },
];

function getNavigationClassName({ isActive }) {
  return isActive
    ? "sidebar-link sidebar-link-active"
    : "sidebar-link";
}

function SidebarLink({ label, path, icon }) {
  return (
    <NavLink
      to={path}
      className={getNavigationClassName}
    >
      <span
        className="sidebar-link-icon"
        aria-hidden="true"
      >
        {icon}
      </span>

      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  /*
   * The signed-in user comes from the auth context. This used to read
   * features/auth/useAuth.js, the sign-in form hook, which never
   * returns a user, so the Plan link was hardcoded visible to everyone.
   */
  const { user } = useAuthenticatedUser();

  const showPlanLink = canPlanAudits(user);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span
          className="sidebar-brand-mark"
          aria-hidden="true"
        >
          EHS
        </span>

        <div className="sidebar-brand-text">
          <strong>EHS Inspection</strong>
          <span>Safety management</span>
        </div>
      </div>

      <nav
        className="sidebar-navigation"
        aria-label="Primary navigation"
      >
        {NAVIGATION_ITEMS.map((item) => (
          <SidebarLink
            key={item.path}
            {...item}
          />
        ))}

        {showPlanLink && (
          <SidebarLink
            label="Plan"
            path="/plan"
            icon="P"
          />
        )}
      </nav>

      <div className="sidebar-footer">
        <span>Environmental Health</span>
        <span>and Safety Tool</span>
      </div>
    </aside>
  );
}
