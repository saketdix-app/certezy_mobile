import { useCallback, useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { callSyncOn, callSyncSupported, syncCalls, turnOffCallSync, turnOnCallSync } from "./callSync";
import { Button, Card } from "./ui";
import { C } from "./theme";

/**
 * Switch for "record calls with my leads" (Android). `compact` shows only the
 * invitation, and nothing once it's on (for the Today screen).
 */
export default function CallSyncCard({ compact }: { compact?: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useFocusEffect(
    useCallback(() => {
      callSyncOn().then(setOn);
    }, [])
  );
  if (!callSyncSupported() || on === null || (compact && on)) return null;

  const turnOn = async () => {
    setBusy(true);
    const ok = await turnOnCallSync();
    setBusy(false);
    setOn(ok);
    if (!ok)
      Alert.alert("Call log access is off", "To record lead calls, allow Call logs for CERTEZY Team in your phone's settings.", [
        { text: "Not now", style: "cancel" },
        { text: "Open settings", onPress: () => Linking.openSettings() },
      ]);
  };
  const syncNow = async () => {
    setBusy(true);
    const n = await syncCalls();
    setBusy(false);
    setMsg(n ? `${n} new lead call${n === 1 ? "" : "s"} recorded.` : "Up to date. No new calls with your leads.");
  };

  return (
    <Card style={compact ? { marginTop: 14 } : undefined}>
      <View style={st.head}>
        <Ionicons name="call-outline" size={18} color={C.primary} />
        <Text style={st.title}>Record calls with your leads</Text>
        {on ? <Text style={st.on}>On</Text> : null}
      </View>
      <Text style={st.body}>
        {on
          ? "Calls with your leads' numbers (made, received or missed) are added to each lead's history automatically. Other calls stay on your phone."
          : "Let the app add calls with your leads to their history automatically: who called, when, and for how long. Other calls stay on your phone."}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        {on ? (
          <>
            <Button small kind="secondary" icon="refresh" title="Sync now" busy={busy} onPress={syncNow} />
            <Button
              small
              kind="secondary"
              title="Turn off"
              disabled={busy}
              onPress={async () => {
                await turnOffCallSync();
                setOn(false);
                setMsg("");
              }}
            />
          </>
        ) : (
          <Button small icon="checkmark" title="Turn on" busy={busy} onPress={turnOn} />
        )}
      </View>
      {msg ? <Text style={st.msg}>{msg}</Text> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flex: 1, fontSize: 15, fontWeight: "800", color: C.navy },
  on: { color: C.green, fontWeight: "800", fontSize: 12 },
  body: { color: C.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  msg: { color: C.muted, fontSize: 12, marginTop: 8 },
});
