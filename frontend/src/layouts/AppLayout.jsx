import {
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";

import Sidebar from "./Sidebar.jsx";

import {
  useAuthenticatedUser,
} from "../app/authProvider.jsx";

export default function AppLayout() {
  const navigate = useNavigate();

  const {
    user,
    isAuthenticated,
    logout,
  } = useAuthenticatedUser();

  function handleLogout() {
    logout();

    navigate("/sign-in", {
      replace: true,
    });
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/sign-in"
        replace
      />
    );
  }

  const displayedName =
    user?.fullName ??
    user?.name ??
    user?.username ??
    "EHS User";

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-main">
        <header className="app-topbar">
          <div>
            <span className="app-topbar-label">
              Authenticated workspace
            </span>

            <strong>{displayedName}</strong>
          </div>

          <div className="app-topbar-user">
            <button
              type="button"
              className="app-logout-button"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="app-page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}