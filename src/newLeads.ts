import { useCallback, useEffect, useState } from "react";
import { AppState, DeviceEventEmitter } from "react-native";

export const LEADS_SEEN = "certezy.leads-seen";
import { api } from "./api";

/** My leads I haven't opened since they were assigned (badge on "My leads"). */
export function useNewLeadsCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    if (!enabled) return;
    api<{ new_leads: number }>("/crm/leads/new-count")
      .then((d) => setCount(Number(d?.new_leads ?? 0)))
      .catch(() => {});
  }, [enabled]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60 * 1000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && load());
    const seen = DeviceEventEmitter.addListener(LEADS_SEEN, load);
    return () => {
      clearInterval(t);
      sub.remove();
      seen.remove();
    };
  }, [load]);
  return { count, refresh: load };
}
