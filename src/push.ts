import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { api } from "./api";

/**
 * Phone notifications: the server pushes every CRM notification (new lead
 * assigned, new student for exam, follow-up due…) to the signed-in phone.
 */
const KEY = "certezy.pushToken";

// Show notifications even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("leads", {
        name: "Leads and exams",
        description: "New leads, students assigned for exams and follow-up reminders",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 200, 250],
        lightColor: "#2F6496",
      });
    }
    if (!Device.isDevice) return null; // emulators without Play services can't receive pushes
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;

    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/notifications/devices", {
      method: "POST",
      body: { token, platform: Platform.OS === "ios" ? "ios" : "android", device_name: Device.modelName ?? null },
    });
    await SecureStore.setItemAsync(KEY, token);
    return token;
  } catch (e: any) {
    // Push isn't set up for this build (no Firebase file) or the network failed: the app still works
    console.warn("Push registration skipped:", e?.message);
    return null;
  }
}

/** Before signing out: stop pushes to this phone. */
export async function unregisterPush() {
  try {
    const token = await SecureStore.getItemAsync(KEY);
    if (token) await api("/notifications/devices", { method: "DELETE", body: { token } });
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // signing out anyway
  }
}

/** Which lead a notification is about (sent by the server as data.lead_id). */
export const leadIdOf = (n?: Notifications.Notification | null): number | null => {
  const d: any = n?.request?.content?.data ?? {};
  if (d.lead_id) return Number(d.lead_id);
  const m = /[?&]lead=(\d+)/.exec(String(d.link ?? ""));
  return m ? Number(m[1]) : null;
};
