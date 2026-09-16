import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const ACCESS_TOKEN_KEY = "ehs_access_token";
const USER_STORAGE_KEY = "ehs_user";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const storedUser =
      localStorage.getItem(USER_STORAGE_KEY);

    return storedUser
      ? JSON.parse(storedUser)
      : null;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(
    readStoredUser,
  );

  const setAuthenticatedUser = useCallback(
    (authenticatedUser, accessToken) => {
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

      setUser(authenticatedUser);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(
        user &&
          localStorage.getItem(
            ACCESS_TOKEN_KEY,
          ),
      ),
      setAuthenticatedUser,
      logout,
    }),
    [
      logout,
      setAuthenticatedUser,
      user,
    ],
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