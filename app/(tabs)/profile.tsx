import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "../../src/auth";
import { ROLE_LABEL } from "../../src/config";
import { Button, Card } from "../../src/ui";
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
      <Button
        kind="danger"
        icon="log-out-outline"
        title="Sign out"
        onPress={() => Alert.alert("Sign out?", "You'll need your password to sign in again.", [
          { text: "Cancel", style: "cancel" },
          { text: "Sign out", style: "destructive", onPress: signOut },
        ])}
      />
      <Text style={st.version}>CERTEZY Team · v{Constants.expoConfig?.version}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.pale, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarText: { fontSize: 26, fontWeight: "800", color: C.primary },
  name: { fontSize: 19, fontWeight: "800", color: C.navy },
  email: { color: C.muted, marginTop: 2 },
  role: { marginTop: 8, color: C.primary, fontWeight: "700" },
  version: { textAlign: "center", color: C.faint, fontSize: 12, marginTop: 8 },
});
