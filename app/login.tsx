import { useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { Button, Field } from "../src/ui";
import { C } from "../src/theme";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your work email and password.");
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (e: any) {
      setError(e?.message ?? "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.navy }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <View style={st.brand}>
            <Image source={require("../assets/icon.png")} style={st.logo} />
            <Text style={st.title}>CERTEZY Team</Text>
            <Text style={st.sub}>Your leads, follow-ups and progress — on the go.</Text>
          </View>
          <View style={st.card}>
            <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@certezy.com" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="Your password" onSubmitEditing={submit} />
            {error ? <Text style={st.error}>{error}</Text> : null}
            <Button title="Sign in" icon="log-in-outline" onPress={submit} busy={busy} />
            <Pressable onPress={() => Linking.openURL("https://certezy.com/forgot-password")} style={{ marginTop: 14, alignSelf: "center" }}>
              <Text style={{ color: C.primary, fontWeight: "700" }}>Forgot password?</Text>
            </Pressable>
          </View>
          <Text style={st.foot}>For CERTEZY E-LEARNING PVT LTD team members. Use the same account as the website.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: 22 },
  brand: { alignItems: "center", marginBottom: 22 },
  logo: { width: 76, height: 76, borderRadius: 20, marginBottom: 12 },
  title: { color: "#fff", fontSize: 26, fontWeight: "800" },
  sub: { color: "#C9DCEC", fontSize: 14, marginTop: 4, textAlign: "center" },
  card: { backgroundColor: C.page, borderRadius: 22, padding: 18 },
  error: { color: C.red, fontWeight: "600", marginBottom: 12 },
  foot: { color: "#C9DCEC", fontSize: 12, textAlign: "center", marginTop: 18 },
});
