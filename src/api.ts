import * as SecureStore from "expo-secure-store";
import { API_BASE } from "./config";

/**
 * Talks to the CERTEZY API. The app stays signed in like other phone apps:
 *  • every request says "X-Client: mobile", so the server gives a long session
 *    (no idle sign-out; it renews itself for 90 days each time it's used);
 *  • the access token goes as a Bearer token; the refresh token is kept in the
 *    phone's secure storage and used to renew the access token silently;
 *  • only when the server says the session is over (signed out elsewhere, account
 *    blocked) is the person signed out — never because of a bad network or a server
 *    restart: then the request fails with a "try again" message and the session stays.
 */
const KEY = "certezy.accessToken";
const REFRESH_KEY = "certezy.refreshToken";
let refreshToken: string | null = null;
const CLIENT_HEADER = { "X-Client": "mobile" };
let token: string | null = null;
let onSignedOut: () => void = () => {};
type Renewal = "ok" | "ended" | "retry";
let refreshing: Promise<Renewal> | null = null;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};

export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(KEY, t);
  else await SecureStore.deleteItemAsync(KEY);
}

export async function loadToken() {
  token = await SecureStore.getItemAsync(KEY);
  refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  return token;
}

export async function setRefreshToken(t: string | null | undefined) {
  refreshToken = t ?? null;
  if (t) await SecureStore.setItemAsync(REFRESH_KEY, t);
  else await SecureStore.deleteItemAsync(REFRESH_KEY);
}
export const getRefreshToken = () => refreshToken;

const renew = () => {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json", ...CLIENT_HEADER },
          body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
        });
        // Only a definite "no" ends the session; a server error / restart is retried later
        if (r.status === 401 || r.status === 403) return "ended";
        if (!r.ok) return "retry";
        const j = await r.json().catch(() => null);
        if (!j?.data?.accessToken) return "retry";
        if (j.data.refreshToken) await setRefreshToken(j.data.refreshToken);
        await setToken(j.data.accessToken);
        return "ok";
      } catch {
        return "retry"; // no internet: keep the session
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
};

type Opts = { method?: string; body?: unknown; query?: Record<string, unknown> };

export async function api<T = any>(path: string, opts: Opts = {}, retry = true): Promise<T> {
  const { method = "GET", body, query } = opts;
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...CLIENT_HEADER,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("No internet connection. Check your network and try again.", 0);
  }

  if (res.status === 401 && retry && !path.startsWith("/auth/login")) {
    const renewal = await renew();
    if (renewal === "ok") return api<T>(path, opts, false);
    if (renewal === "retry") throw new ApiError("Can't reach CERTEZY right now. Check your network and try again.", 0);
    await setToken(null);
    await setRefreshToken(null);
    onSignedOut();
    throw new ApiError("Your session has ended. Please sign in again.", 401);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(j?.message || `Something went wrong (${res.status})`, res.status);
  return j?.data as T;
}
