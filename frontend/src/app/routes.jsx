import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import AppLayout from "../layouts/AppLayout.jsx";

import HomePage from "../features/auth/HomePage.jsx";
import LoginPage from "../features/auth/LoginPage.jsx";
import EntraCallbackPage from "../features/auth/EntraCallbackPage.jsx";
import SignupPage from "../features/auth/SignupPage.jsx";

import DashboardPage from "../features/dashboard/DashboardPage.jsx";
import ObservationPage from "../features/observations/ObservationPage.jsx";
import ClosurePage from "../features/closures/ClosurePage.jsx";
import PlanningPage from "../features/patrols/PlanningPage.jsx";

import RequireRole from "./RequireRole.jsx";

import {
  PLANNING_ROLES,
} from "../constants/roles.js";

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={<HomePage />}
      />

      <Route
        path="/sign-in"
        element={<LoginPage />}
      />

      <Route
        path="/sign-up"
        element={<SignupPage />}
      />

      {/*
        * Public by necessity: this is where Microsoft sends the browser
        * back to, and at that point there is no session yet. It carries
        * a one-time code which it trades for one.
        */}
      <Route
        path="/auth/entra/callback"
        element={<EntraCallbackPage />}
      />

      {/* All authenticated pages use AppLayout */}
      <Route element={<AppLayout />}>
        <Route
          path="/dashboard"
          element={<DashboardPage />}
        />

        <Route
          path="/ehs-officer"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

        <Route
          path="/observations"
          element={<ObservationPage />}
        />

        <Route
          path="/closures"
          element={<ClosurePage />}
        />

        {/* Planning is EHS Officer work; the API enforces it too. */}
        <Route
          path="/plan"
          element={
            <RequireRole roles={PLANNING_ROLES}>
              <PlanningPage />
            </RequireRole>
          }
        />
      </Route>

      <Route
        path="*"
        element={
          <Navigate to="/" replace />
        }
      />
    </Routes>
  );
}
