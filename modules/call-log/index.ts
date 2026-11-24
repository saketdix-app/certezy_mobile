import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

export type PhoneCall = { number: string; type: "incoming" | "outgoing" | "missed" | "rejected"; date: number; duration: number };

type Native = { hasPermission(): boolean; getCalls(since: number, limit: number): Promise<PhoneCall[]> };

// Present only in the Android app build (not in an older APK, iOS or Expo Go)
const native = Platform.OS === "android" ? requireOptionalNativeModule<Native>("CertezyCallLog") : null;

export const callLogAvailable = () => !!native;
export const hasCallLogPermission = () => !!native?.hasPermission();
export const getCalls = (since: number, limit = 500) => (native ? native.getCalls(since, limit) : Promise.resolve([]));
