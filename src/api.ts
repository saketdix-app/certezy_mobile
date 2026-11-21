import * as SecureStore from "expo-secure-store";
import { API_BASE } from "./config";

/**
 * Talks to the CERTEZY API like the website does:
 *  • the access token from login is sent as a Bearer token (kept in SecureStore);
 *  • the refresh token is the httpOnly cookie the server sets at login — Android's
 *    native networking keeps it, so an expired access token is renewed silently;
 *  • if renewing fails the person is signed out.
 */
const KEY = "certezy.accessToken";
let token: string | null = null;
let onSignedOut: () => void = () => {};
let refreshing: Promise<boolean> | null = null;

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
  return token;
}

const renew = () => {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!r.ok) return false;
        const j = await r.json();
        if (!j?.data?.accessToken) return false;
        await setToken(j.data.accessToken);
        return true;
      } catch {
        return false;
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
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("No internet connection. Check your network and try again.", 0);
  }

  if (res.status === 401 && retry && !path.startsWith("/auth/login")) {
    if (await renew()) return api<T>(path, opts, false);
    await setToken(null);
    onSignedOut();
    throw new ApiError("Your session has ended. Please sign in again.", 401);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(j?.message || `Something went wrong (${res.status})`, res.status);
  return j?.data as T;
}
