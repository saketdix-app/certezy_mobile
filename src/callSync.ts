import { PermissionsAndroid, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import { callLogAvailable, getCalls, hasCallLogPermission } from "../modules/call-log";

/**
 * Lead calls from the phone's call log → the lead's history (Android).
 *  • On by default once call-log access is allowed (asked once after sign-in);
 *    it can be switched off in Profile.
 *  • Runs when the app opens or comes back (e.g. after a call) and in the
 *    background about every 15 minutes, so calls made from the phone's own
 *    dialer are picked up too.
 *  • Every run looks at the last few days again and the server ignores calls it
 *    already has — so a call is never missed because the lead was added or
 *    assigned after the call.
 *  • The phone downloads its leads' numbers and matches here: only calls with a
 *    lead's number are sent. Personal calls never leave the phone.
 */
const OFF_KEY = "certezy.callSync.off";
const ASKED_KEY = "certezy.callSync.asked";
const FULL_KEY = "certezy.callSync.firstDone";
const LAST_KEY = "certezy.callSync.last";
const WINDOW_MS = 3 * 864e5; // each run re-checks the last 3 days
const FIRST_WINDOW_MS = 7 * 864e5; // first run: the last 7 days
const INDEX_TTL_MS = 3 * 60e3;

const last10 = (v: string) => String(v ?? "").replace(/\D/g, "").slice(-10);

export const callSyncSupported = () => Platform.OS === "android" && callLogAvailable();

export async function callSyncOn() {
  if (!callSyncSupported() || !hasCallLogPermission()) return false;
  return (await SecureStore.getItemAsync(OFF_KEY)) !== "1";
}

const ask = async () => {
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG, {
    title: "Record calls with your leads",
    message:
      "CERTEZY Team checks your call log for your leads' numbers and adds those calls (made, received, missed, and how long you talked) to the lead's history. Other calls stay on your phone.",
    buttonPositive: "Allow",
    buttonNegative: "Not now",
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
};

/** After sign-in: ask for call-log access once (later: Profile → Record calls). */
export async function askForCallLogOnce() {
  if (!callSyncSupported() || hasCallLogPermission()) return;
  if ((await SecureStore.getItemAsync(ASKED_KEY)) === "1") return;
  await SecureStore.setItemAsync(ASKED_KEY, "1");
  if (await ask()) syncCalls();
}

/** Switch on from the card (asks for access if needed). Resolves false if declined. */
export async function turnOnCallSync() {
  if (!callSyncSupported()) return false;
  if (!hasCallLogPermission() && !(await ask())) return false;
  await SecureStore.deleteItemAsync(OFF_KEY);
  syncCalls();
  return true;
}

export async function turnOffCallSync() {
  await SecureStore.setItemAsync(OFF_KEY, "1");
}

/** When calls were last checked (ms), for "Last checked …". */
export const lastCallSync = async () => Number(await SecureStore.getItemAsync(LAST_KEY)) || null;

let running: Promise<number> | null = null;
let index: { at: number; map: Map<string, number> } | null = null;

const leadNumbers = async () => {
  if (index && Date.now() - index.at < INDEX_TTL_MS) return index.map;
  const rows = await api<{ id: number; p: string | null; w: string | null }[]>("/crm/leads/phone-index");
  const map = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.p) map.set(r.p, r.id);
    if (r.w && !map.has(r.w)) map.set(r.w, r.id);
  }
  index = { at: Date.now(), map };
  return map;
};

/** Send lead calls from the last few days (repeats are ignored by the server). Returns how many were new. Never throws. */
export function syncCalls(): Promise<number> {
  if (running) return running;
  running = (async () => {
    try {
      if (!(await callSyncOn())) return 0;
      const firstDone = (await SecureStore.getItemAsync(FULL_KEY)) === "1";
      const since = Date.now() - (firstDone ? WINDOW_MS : FIRST_WINDOW_MS);
      const calls = await getCalls(since, 2000);
      let recorded = 0;
      if (calls.length) {
        const numbers = await leadNumbers();
        const matched = calls
          .map((c) => ({ c, lead: numbers.get(last10(c.number)) }))
          .filter((x) => x.lead)
          .map(({ c, lead }) => ({ lead_id: lead!, direction: c.type, at: new Date(c.date).toISOString(), duration_sec: c.duration }));
        for (let i = 0; i < matched.length; i += 200) {
          const r = await api<{ recorded: number }>("/crm/calls/sync", { method: "POST", body: { calls: matched.slice(i, i + 200) } });
          recorded += r?.recorded ?? 0;
        }
      }
      await SecureStore.setItemAsync(FULL_KEY, "1");
      await SecureStore.setItemAsync(LAST_KEY, String(Date.now()));
      return recorded;
    } catch {
      return 0; // offline or signed out: the next run covers the same days again
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
