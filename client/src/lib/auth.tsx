import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, request, setCsrfToken } from "./api";
import type { Row } from "./utils";
export type Session = {
  user: Row;
  permissions: string[];
  csrfToken: string;
  connection: {
    configured: boolean;
    connected: boolean;
    provider?: "postgresql";
  };
};
const AuthContext = createContext<{
  session?: Session;
  loading: boolean;
  error: Error | null;
  can: (permission: string) => boolean;
  refresh: () => void;
}>({ loading: true, error: null, can: () => false, refresh: () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["auth"],
    queryFn: async () => {
      const response = await request<Session>("/auth/me");
      setCsrfToken(response.data.csrfToken);
      return response.data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    const expire = () => {
      setCsrfToken("");
      qc.setQueryData(["auth"], null);
      qc.invalidateQueries({ queryKey: ["auth"] });
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [qc]);
  return (
    <AuthContext.Provider
      value={{
        session: q.data || undefined,
        loading: q.isPending,
        error:
          q.error instanceof ApiError && q.error.status === 401
            ? null
            : q.error,
        can: (p) => !!q.data?.permissions.includes(p),
        refresh: () => {
          qc.invalidateQueries({ queryKey: ["auth"] });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
