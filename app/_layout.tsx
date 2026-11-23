import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { leadIdOf } from "../src/push";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth";
import { Loading } from "../src/ui";
import { C } from "../src/theme";

/** Signed out → login; signed in → the tabs. */
function Gate() {
  const { user, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === "login";
    if (!user && !onLogin) router.replace("/login");
    if (user && onLogin) router.replace("/");
  }, [user, ready, segments, router]);

  // Tapping a notification (also when it opened the app) → that lead, or the notifications list
  useEffect(() => {
    if (!user) return;
    const open = (n?: Notifications.Notification | null) => {
      if (!n) return;
      const id = leadIdOf(n);
      router.push(id ? `/lead/${id}` : "/notifications");
    };
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) {
        open(r.notification);
        Notifications.clearLastNotificationResponseAsync?.();
      }
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, [user, router]);

  if (!ready) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.navy },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "800" },
        contentStyle: { backgroundColor: C.page },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="lead/[id]" options={{ title: "Lead" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
