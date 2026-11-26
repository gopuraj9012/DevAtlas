import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getToken, setToken, type AuthResponse, type User } from "@/lib/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  canEdit: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  const qc = useQueryClient();

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    if (!getToken()) return;
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener("devatlas:unauthorized", onUnauthorized);
    return () => window.removeEventListener("devatlas:unauthorized", onUnauthorized);
  }, [logout]);

  const accept = (res: AuthResponse) => {
    setToken(res.token);
    qc.clear();
    setUser(res.user);
  };

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      canEdit: user?.role === "maintainer" || user?.role === "owner",
      login: async (email, password) => accept(await api<AuthResponse>("/auth/login", { body: { email, password } })),
      signup: async (email, password, name) => accept(await api<AuthResponse>("/auth/signup", { body: { email, password, name } })),
      logout,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
