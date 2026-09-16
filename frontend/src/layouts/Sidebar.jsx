import {
  NavLink,
} from "react-router-dom";

import useAuth
  from "../features/auth/useAuth.js";

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

function normalizeRole(role) {
  if (typeof role === "string") {
    return role
      .trim()
      .toUpperCase();
  }

  return String(
    role?.code ??
    role?.roleCode ??
    role?.role_code ??
    role?.name ??
    role?.role ??
    "",
  )
    .trim()
    .toUpperCase();
}

function normalizeRoles(roleValue) {
  if (Array.isArray(roleValue)) {
    return roleValue
      .map(normalizeRole)
      .filter(Boolean);
  }

  if (typeof roleValue === "string") {
    return roleValue
      .split(",")
      .map((role) => {
        return role
          .trim()
          .toUpperCase();
      })
      .filter(Boolean);
  }

  return [];
}

function getUserRoles(user) {
  const allRoles = [
    ...normalizeRoles(user?.roles),
    ...normalizeRoles(user?.roleCodes),
    ...normalizeRoles(user?.role_codes),
    ...normalizeRoles(user?.appRoles),
    ...normalizeRoles(user?.app_roles),
    ...normalizeRoles(user?.role),
  ];

  return [
    ...new Set(allRoles),
  ];
}

function hasRole(
  user,
  requiredRole,
) {
  const normalizedRequiredRole =
    String(requiredRole ?? "")
      .trim()
      .toUpperCase();

  return getUserRoles(user).includes(
    normalizedRequiredRole,
  );
}

function getNavigationClassName({
  isActive,
}) {
  return isActive
    ? "sidebar-link sidebar-link-active"
    : "sidebar-link";
}

function SidebarLink({
  label,
  path,
  icon,
}) {
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
  const {
    user,
  } = useAuth();

  const canPlanAudits =
    true;
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
          <strong>
            EHS Inspection
          </strong>

          <span>
            Safety management
          </span>
        </div>
      </div>

      <nav
        className="sidebar-navigation"
        aria-label="Primary navigation"
      >
        {NAVIGATION_ITEMS.map(
          ({
            label,
            path,
            icon,
          }) => (
            <SidebarLink
              key={path}
              label={label}
              path={path}
              icon={icon}
            />
          ),
        )}

        {canPlanAudits && (
          <SidebarLink
            label="Plan"
            path="/plan"
            icon="P"
          />
        )}
      </nav>

      <div className="sidebar-footer">
        <span>
          Environmental Health
        </span>

        <span>
          and Safety Tool
        </span>
      </div>
    </aside>
  );
}