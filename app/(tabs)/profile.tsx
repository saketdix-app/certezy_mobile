import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
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
      <Text style={st.note}>You stay signed in on this phone. Sign out only if someone else will use it.</Text>
      <Text style={st.version}>CERTEZY Team · v{Constants.expoConfig?.version}</Text>
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

const st = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.pale, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarText: { fontSize: 26, fontWeight: "800", color: C.primary },
  name: { fontSize: 19, fontWeight: "800", color: C.navy },
  email: { color: C.muted, marginTop: 2 },
  role: { marginTop: 8, color: C.primary, fontWeight: "700" },
  note: { textAlign: "center", color: C.muted, fontSize: 13, marginTop: 4 },
  version: { textAlign: "center", color: C.faint, fontSize: 12, marginTop: 8 },
});
