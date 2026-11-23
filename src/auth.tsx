import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, getRefreshToken, loadToken, setRefreshToken, setSignedOutHandler, setToken } from "./api";
import { TEAM_ROLES } from "./config";
import { registerForPush, unregisterPush } from "./push";

export type User = { id: number; name: string; email: string; role: string; mobile?: string | null };

type Auth = {
  user: User | null;
  ready: boolean;
  /** Resolves with a challenge when two-step sign-in is on (enter the emailed code next). */
  signIn: (email: string, password: string) => Promise<{ challenge: string; email_hint: string } | null>;
  verifyCode: (challenge: string, code: string) => Promise<void>;
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
          if (isTeam(me.role)) {
            setUser(me);
            registerForPush();
          }
          else await setToken(null);
        }
      } catch {
        // signed out or offline: show the login screen
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const finish = useCallback(async (data: { user: User; accessToken: string; refreshToken?: string }) => {
    if (!isTeam(data.user?.role)) {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      throw new ApiError("This app is for the CERTEZY team. Students can learn on certezy.com.", 403);
    }
    await setToken(data.accessToken);
    await setRefreshToken(data.refreshToken);
    setUser(data.user);
    registerForPush();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const data = await api<any>("/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password },
      });
      if (data?.two_factor_required) return { challenge: data.challenge, email_hint: data.email_hint };
      await finish(data);
      return null;
    },
    [finish]
  );

  const verifyCode = useCallback(
    async (challenge: string, code: string) => {
      const data = await api<any>("/auth/login/verify", { method: "POST", body: { challenge, code } });
      await finish(data);
    },
    [finish]
  );

  const signOut = useCallback(async () => {
    await unregisterPush();
    await api("/auth/logout", { method: "POST", body: { refresh_token: getRefreshToken() } }).catch(() => {});
    await setToken(null);
    await setRefreshToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, signIn, verifyCode, signOut }), [user, ready, signIn, verifyCode, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};
