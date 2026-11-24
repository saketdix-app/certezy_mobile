import { PermissionsAndroid, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import { callLogAvailable, getCalls, hasCallLogPermission } from "../modules/call-log";

/**
 * Lead calls from the phone's call log → the lead's history (Android).
 * The phone downloads the numbers of this person's leads and matches its call
 * log against them here; only calls with a lead's number are sent. Personal
 * calls never leave the phone.
 */
const ON_KEY = "certezy.callSync.on";
const SINCE_KEY = "certezy.callSync.since";
const FIRST_LOOKBACK_MS = 24 * 3600e3; // on first use, pick up the last day's calls

const last10 = (v: string) => String(v ?? "").replace(/\D/g, "").slice(-10);

export const callSyncSupported = () => Platform.OS === "android" && callLogAvailable();

export async function callSyncOn() {
  if (!callSyncSupported()) return false;
  return (await SecureStore.getItemAsync(ON_KEY)) === "1" && hasCallLogPermission();
}

/** Ask for call-log access and switch syncing on. Resolves false if declined. */
export async function turnOnCallSync() {
  if (!callSyncSupported()) return false;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG, {
    title: "Record calls with your leads",
    message:
      "CERTEZY Team checks your call log for your leads' numbers and adds those calls to the lead's history. Other calls stay on your phone.",
    buttonPositive: "Allow",
    buttonNegative: "Not now",
  });
  if (r !== PermissionsAndroid.RESULTS.GRANTED) return false;
  await SecureStore.setItemAsync(ON_KEY, "1");
  syncCalls();
  return true;
}

export async function turnOffCallSync() {
  await SecureStore.deleteItemAsync(ON_KEY);
}

let running: Promise<number> | null = null;
let index: { at: number; map: Map<string, number> } | null = null;

const leadNumbers = async () => {
  if (index && Date.now() - index.at < 10 * 60e3) return index.map;
  const rows = await api<{ id: number; p: string | null; w: string | null }[]>("/crm/leads/phone-index");
  const map = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.p) map.set(r.p, r.id);
    if (r.w && !map.has(r.w)) map.set(r.w, r.id);
  }
  index = { at: Date.now(), map };
  return map;
};

/** Send new lead calls since the last sync. Returns how many were recorded. Never throws. */
export function syncCalls(): Promise<number> {
  if (running) return running;
  running = (async () => {
    try {
      if (!(await callSyncOn())) return 0;
      const saved = Number(await SecureStore.getItemAsync(SINCE_KEY));
      const since = saved > 0 ? saved : Date.now() - FIRST_LOOKBACK_MS;
      const calls = await getCalls(since, 500);
      if (!calls.length) return 0;
      const numbers = await leadNumbers();
      const matched = calls
        .map((c) => ({ c, lead: numbers.get(last10(c.number)) }))
        .filter((x) => x.lead)
        .map(({ c, lead }) => ({ lead_id: lead!, direction: c.type, at: new Date(c.date).toISOString(), duration_sec: c.duration }));
      let recorded = 0;
      for (let i = 0; i < matched.length; i += 200) {
        const r = await api<{ recorded: number }>("/crm/calls/sync", { method: "POST", body: { calls: matched.slice(i, i + 200) } });
        recorded += r?.recorded ?? 0;
      }
      // Only move on once everything was sent (a failure retries next time; the server ignores repeats)
      await SecureStore.setItemAsync(SINCE_KEY, String(calls[calls.length - 1].date));
      return recorded;
    } catch {
      return 0;
    } finally {
      setTimeout(() => (running = null), 0);
    }
  })();
  return running;
}

/** Forget the cached lead numbers (e.g. after leads were reassigned). */
export const refreshLeadNumbers = () => {
  index = null;
};
