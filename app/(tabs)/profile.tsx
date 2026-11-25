import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import * as Application from "expo-application";
import { useState } from "react";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { ROLE_LABEL } from "../../src/config";
import { Button, Card } from "../../src/ui";
import CallSyncCard from "../../src/CallSyncCard";
import { C } from "../../src/theme";

export default function Profile() {
  const { user, signOut } = useAuth();
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Card style={{ alignItems: "center", paddingVertical: 22 }}>
        <View style={st.avatar}>
          <Text style={st.avatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
        </View>
        <Text style={st.name}>{user?.name}</Text>
        <Text style={st.email}>{user?.email}</Text>
        <Text style={st.role}>{ROLE_LABEL[user?.role ?? ""] ?? user?.role}</Text>
      </Card>
      <Button kind="secondary" icon="globe-outline" title="Open the full CRM on the web" onPress={() => Linking.openURL("https://certezy.com/login")} />
      <CallSyncCard />
      <UpdateCard />
      <Text style={st.note}>You stay signed in on this phone. Sign out only if someone else will use it.</Text>
      <Text style={st.version}>
        CERTEZY Team · v{Constants.expoConfig?.version} ({Application.nativeBuildVersion ?? Constants.expoConfig?.android?.versionCode})
        {Updates.updateId && !Updates.isEmbeddedLaunch ? " · updated" : ""}
      </Text>
      <Pressable
        style={{ alignSelf: "center", padding: 8 }}
        onPress={() =>
          Alert.alert("Sign out of this phone?", "You'll need your password to sign in again.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: signOut },
          ])
        }
      >
        <Text style={{ color: C.muted, textDecorationLine: "underline" }}>Sign out of this phone</Text>
      </Pressable>
    </View>
  );
}

/**
 * Check for updates:
 *  1. small updates download into the app (Expo updates) and apply on restart;
 *  2. a new APK published by an Admin (Admin → Integrations) is offered as a download.
 */
function UpdateCard() {
  const [state, setState] = useState<"idle" | "checking" | "downloading">("idle");
  const [msg, setMsg] = useState("");
  const installedCode = Number(Application.nativeBuildVersion ?? Constants.expoConfig?.android?.versionCode ?? 0);

  const check = async () => {
    setState("checking");
    setMsg("");
    try {
      // 1) A newer APK (new features that need a reinstall)
      const rel = await api<any>("/crm/app-release").catch(() => null);
      if (rel?.version_code && rel.version_code > installedCode && rel.apk_url) {
        setState("idle");
        Alert.alert(
          `Version ${rel.version} is available`,
          `${rel.notes ? `${rel.notes}\n\n` : ""}Download and install it over this app — you'll stay signed in.`,
          [
            { text: "Later", style: "cancel" },
            { text: "Download", onPress: () => Linking.openURL(rel.apk_url) },
          ]
        );
        return;
      }
      // 2) A small update for this version
      if (!__DEV__ && Updates.isEnabled) {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) {
          setState("downloading");
          await Updates.fetchUpdateAsync();
          setState("idle");
          Alert.alert("Update ready", "Restart the app to use it.", [
            { text: "Later", style: "cancel" },
            { text: "Restart now", onPress: () => Updates.reloadAsync() },
          ]);
          return;
        }
      }
      setState("idle");
      setMsg("You're on the latest version.");
    } catch (e: any) {
      setState("idle");
      setMsg(e?.message ? `Couldn't check: ${e.message}` : "Couldn't check. Try again on a good connection.");
    }
  };

  return (
    <View style={st.updateBox}>
      <Button
        kind="secondary"
        icon="cloud-download-outline"
        title={state === "checking" ? "Checking…" : state === "downloading" ? "Downloading update…" : "Check for updates"}
        busy={state !== "idle"}
        onPress={check}
      />
      {msg ? <Text style={st.updateMsg}>{msg}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  updateBox: { gap: 6 },
  updateMsg: { textAlign: "center", color: C.muted, fontSize: 13 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.pale, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarText: { fontSize: 26, fontWeight: "800", color: C.primary },
  name: { fontSize: 19, fontWeight: "800", color: C.navy },
  email: { color: C.muted, marginTop: 2 },
  role: { marginTop: 8, color: C.primary, fontWeight: "700" },
  note: { textAlign: "center", color: C.muted, fontSize: 13, marginTop: 4 },
  version: { textAlign: "center", color: C.faint, fontSize: 12, marginTop: 8 },
});
