import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
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

// Who's signed in, kept on the phone so the app opens signed in even without internet
const USER_KEY = "certezy.user";
const saveUser = (u: User | null) =>
  (u ? SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)) : SecureStore.deleteItemAsync(USER_KEY)).catch(() => {});
const cachedUser = async (): Promise<User | null> => {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSignedOutHandler(() => {
      saveUser(null);
      setUser(null);
    });
    (async () => {
      let known: User | null = null;
      try {
        if (await loadToken()) {
          // Open straight away as the saved person; then confirm with the server
          known = await cachedUser();
          if (known) {
            setUser(known);
            setReady(true);
          }
          const { user: me } = await api<{ user: User }>("/auth/me");
          if (isTeam(me.role)) {
            setUser(me);
            saveUser(me);
            registerForPush();
          } else {
            await setToken(null);
            await setRefreshToken(null);
            saveUser(null);
            setUser(null);
          }
        }
      } catch (e) {
        // Session over → the API already signed out. No internet / server busy → stay signed in.
        if (e instanceof ApiError && e.status === 401) {
          saveUser(null);
          setUser(null);
        }
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
    saveUser(data.user);
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
    saveUser(null);
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
