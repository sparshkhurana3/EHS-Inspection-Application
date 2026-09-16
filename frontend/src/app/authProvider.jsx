import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ACCESS_TOKEN_KEY,
  USER_STORAGE_KEY,
  setUnauthorizedHandler,
} from "../services/apiClient.js";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const storedUser = localStorage.getItem(
      USER_STORAGE_KEY,
    );

    return storedUser
      ? JSON.parse(storedUser)
      : null;
  } catch {
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      /* storage unavailable; nothing to clean up */
    }

    return null;
  }
}

function readStoredToken() {
  try {
    return localStorage.getItem(
      ACCESS_TOKEN_KEY,
    );
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(
    readStoredUser,
  );

  /*
   * The token is held in state as well as storage so that
   * isAuthenticated reacts to a sign-out, including one triggered by a
   * 401 from any request.
   */
  const [token, setToken] = useState(
    readStoredToken,
  );

  const setAuthenticatedUser = useCallback(
    (authenticatedUser, accessToken) => {
      try {
        if (accessToken) {
          localStorage.setItem(
            ACCESS_TOKEN_KEY,
            accessToken,
          );
        }

        if (authenticatedUser) {
          localStorage.setItem(
            USER_STORAGE_KEY,
            JSON.stringify(authenticatedUser),
          );
        }
      } catch {
        /* private mode: keep the session in memory only */
      }

      setToken(accessToken ?? readStoredToken());
      setUser(authenticatedUser);
    },
    [],
  );

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }

    setToken(null);
    setUser(null);
  }, []);

  /*
   * An expired token used to leave the user inside the app watching
   * every page fail. Clearing the session on any 401 sends them back to
   * sign-in once.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => logout());

    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user && token),
      setAuthenticatedUser,
      logout,
    }),
    [user, token, setAuthenticatedUser, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthenticatedUser() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuthenticatedUser must be used inside AuthProvider.",
    );
  }

  return context;
}
