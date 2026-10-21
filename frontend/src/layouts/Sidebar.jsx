import {
  NavLink,
} from "react-router-dom";

import {
  useAuthenticatedUser,
} from "../app/authProvider.jsx";

import {
  canPlanAudits,
  canViewReports,
} from "../constants/roles.js";

import { BRAND } from "../brand/brand.js";
import BrandMark from "../brand/BrandMark.jsx";
import CompanyLogo from "../brand/CompanyLogo.jsx";

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
  const showReportLink = canViewReports(user);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <BrandMark
          className="sidebar-brand-mark"
          surface="dark"
        />

        <div className="sidebar-brand-text">
          <strong>{BRAND.productName}</strong>
          <span>{BRAND.tagline}</span>
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

        {showReportLink && (
          <SidebarLink
            label="Report"
            path="/reports"
            icon="R"
          />
        )}
      </nav>

      <div className="sidebar-footer">
        <CompanyLogo
          surface="dark"
          className="brand-company-logo-sidebar"
        />

        <span>{BRAND.footerLegal}</span>
        <span>Environmental Health and Safety Tool</span>
      </div>
    </aside>
  );
}
