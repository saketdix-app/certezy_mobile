import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, loadToken, setSignedOutHandler, setToken } from "./api";
import { TEAM_ROLES } from "./config";

export type User = { id: number; name: string; email: string; role: string; mobile?: string | null };

type Auth = {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);
const isTeam = (role?: string) => TEAM_ROLES.includes(role as (typeof TEAM_ROLES)[number]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSignedOutHandler(() => setUser(null));
    (async () => {
      try {
        if (await loadToken()) {
          const { user: me } = await api<{ user: User }>("/auth/me");
          if (isTeam(me.role)) setUser(me);
          else await setToken(null);
        }
      } catch {
        // signed out or offline: show the login screen
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: User; accessToken: string }>("/auth/login", {
      method: "POST",
      body: { email: email.trim().toLowerCase(), password },
    });
    if (!isTeam(data.user?.role)) {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      throw new ApiError("This app is for the CERTEZY team. Students can learn on certezy.com.", 403);
    }
    await setToken(data.accessToken);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    await setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, signIn, signOut }), [user, ready, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};
