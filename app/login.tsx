import { useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { Button, Field } from "../src/ui";
import { C } from "../src/theme";

export default function Login() {
  const { signIn, verifyCode } = useAuth();
  // Two-step sign-in: the emailed 6-digit code
  const [twoStep, setTwoStep] = useState<{ challenge: string; email_hint: string } | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your work email and password.");
    setBusy(true);
    setError("");
    try {
      if (twoStep) {
        if (!/^\d{6}$/.test(code)) {
          setError("Enter the 6-digit code from the email.");
          return;
        }
        await verifyCode(twoStep.challenge, code);
        return;
      }
      const step = await signIn(email, password);
      if (step) setTwoStep(step);
    } catch (e: any) {
      if (twoStep && /sign in again/i.test(e?.message ?? "")) {
        setTwoStep(null);
        setCode("");
      }
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
            {twoStep ? (
              <>
                <Text style={st.codeInfo}>We emailed a 6-digit code to {twoStep.email_hint}. It works for 10 minutes.</Text>
                <Field
                  label="Sign-in code"
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  placeholder="••••••"
                  maxLength={6}
                  style={{ fontSize: 24, letterSpacing: 8, textAlign: "center", fontWeight: "800" }}
                  onSubmitEditing={submit}
                  autoFocus
                />
              </>
            ) : (
              <>
                <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@certezy.com" />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="Your password" onSubmitEditing={submit} />
              </>
            )}
            {error ? <Text style={st.error}>{error}</Text> : null}
            <Button title={twoStep ? "Verify and sign in" : "Sign in"} icon={twoStep ? "shield-checkmark-outline" : "log-in-outline"} onPress={submit} busy={busy} />
            {twoStep ? (
              <Pressable onPress={() => { setTwoStep(null); setCode(""); setError(""); }} style={{ marginTop: 14, alignSelf: "center" }}>
                <Text style={{ color: C.primary, fontWeight: "700" }}>Back to sign in</Text>
              </Pressable>
            ) : null}
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
  codeInfo: { color: C.muted, marginBottom: 12, lineHeight: 20 },
  foot: { color: "#C9DCEC", fontSize: 12, textAlign: "center", marginTop: 18 },
});
