import { useCallback, useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { askForRecordings, callSyncOn, callSyncSupported, lastCallSync, recordingStats, recordingsOn, syncCalls, turnOffCallSync, turnOnCallSync } from "./callSync";
import { recordingsAvailable } from "../modules/call-log";
import { updateBackgroundCallSync } from "./backgroundCallSync";
import { fmtDateTime } from "./crm";
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
  const [last, setLast] = useState<number | null>(null);
  const [recOn, setRecOn] = useState(false);
  const [recStats, setRecStats] = useState<{ uploaded: number; found: number; at: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      callSyncOn().then(setOn);
      lastCallSync().then(setLast);
      setRecOn(recordingsOn());
      recordingStats().then(setRecStats);
    }, [])
  );
  if (!callSyncSupported() || on === null || (compact && on)) return null;

  const turnOn = async () => {
    setBusy(true);
    const ok = await turnOnCallSync();
    setBusy(false);
    setOn(ok);
    updateBackgroundCallSync();
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
    lastCallSync().then(setLast);
    recordingStats().then(setRecStats);
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
          ? "Calls with your leads' numbers (made, received, missed, and how long you talked) are added to each lead's history within about a minute of the call ending — also when you call from the phone's dialer and the app is closed. Other calls stay on your phone."
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
                updateBackgroundCallSync();
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
      {on && last ? <Text style={st.msg}>Last checked {fmtDateTime(new Date(last).toISOString())} IST</Text> : null}
      {on && recordingsAvailable() ? (
        <View style={st.rec}>
          <View style={st.head}>
            <Ionicons name="mic-outline" size={16} color={C.primary} />
            <Text style={st.recTitle}>Call recordings</Text>
            {recOn ? <Text style={st.on}>On</Text> : null}
          </View>
          {recOn ? (
            <Text style={st.body}>
              {recStats?.found
                ? `Recordings of your lead calls are uploaded for review (${recStats.uploaded} so far). Other recordings stay on your phone.`
                : "No call recordings found on this phone yet. Turn on automatic call recording in your Phone app's settings. (Phones that use Google's Phone app keep recordings private, so they can't be uploaded.)"}
            </Text>
          ) : (
            <>
              <Text style={st.body}>If your phone records calls, allow access so recordings of lead calls are uploaded for review. Other recordings stay on your phone.</Text>
              <View style={{ flexDirection: "row", marginTop: 8 }}>
                <Button
                  small
                  icon="checkmark"
                  title="Allow recordings"
                  busy={busy}
                  onPress={async () => {
                    const ok = await askForRecordings();
                    setRecOn(ok);
                    if (!ok)
                      Alert.alert("Access is off", "Allow Music and audio (or Files) for CERTEZY Team in your phone's settings.", [
                        { text: "Not now", style: "cancel" },
                        { text: "Open settings", onPress: () => Linking.openSettings() },
                      ]);
                  }}
                />
              </View>
            </>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flex: 1, fontSize: 15, fontWeight: "800", color: C.navy },
  on: { color: C.green, fontWeight: "800", fontSize: 12 },
  body: { color: C.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  msg: { color: C.muted, fontSize: 12, marginTop: 8 },
  rec: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  recTitle: { flex: 1, fontSize: 14, fontWeight: "800", color: C.navy },
});
