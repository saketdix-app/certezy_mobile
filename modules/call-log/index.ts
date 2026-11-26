import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

export type PhoneCall = { number: string; type: "incoming" | "outgoing" | "missed" | "rejected"; date: number; duration: number };

type Native = {
  hasPermission(): boolean;
  getCalls(since: number, limit: number): Promise<PhoneCall[]>;
  // Added in v1.9.0 — missing in older APKs
  startWatching?(): void;
  stopWatching?(): void;
  hasAudioPermission?(): boolean;
  findRecordings?(since: number, limit: number): Promise<PhoneRecording[]>;
  uploadFile?(uri: string, url: string, headers: Record<string, string>): Promise<number>;
  uploadedRecordings?(): string[];
  markRecordingUploaded?(key: string): void;
};

/** An audio file the phone's own dialer saved in a call-recording folder. Times in ms. */
export type PhoneRecording = { id: string; uri: string; name: string; path: string; size: number; added: number; modified: number; duration: number; mime: string };

// Present only in the Android app build (not in an older APK, iOS or Expo Go)
const native = Platform.OS === "android" ? requireOptionalNativeModule<Native>("CertezyCallLog") : null;

export const callLogAvailable = () => !!native;
export const hasCallLogPermission = () => !!native?.hasPermission();
export const getCalls = (since: number, limit = 500) => (native ? native.getCalls(since, limit) : Promise.resolve([]));

/** Sync a few seconds after each call ends (Android wakes the app when the call log changes). */
export const startCallLogWatch = () => {
  try {
    native?.startWatching?.();
  } catch {
    // older build: the 15-minute check still runs
  }
};
export const stopCallLogWatch = () => {
  try {
    native?.stopWatching?.();
  } catch {
    // nothing to stop
  }
};

// ── Call recordings (saved by the phone's own dialer) ──
export const recordingsAvailable = () => !!native?.findRecordings;
export const hasAudioPermission = () => !!native?.hasAudioPermission?.();
export const findRecordings = (since: number, limit = 300) => (native?.findRecordings ? native.findRecordings(since, limit) : Promise.resolve([]));
export const uploadRecordingFile = (uri: string, url: string, headers: Record<string, string>) =>
  native?.uploadFile ? native.uploadFile(uri, url, headers) : Promise.resolve(0);
export const uploadedRecordings = () => new Set(native?.uploadedRecordings?.() ?? []);
export const markRecordingUploaded = (key: string) => native?.markRecordingUploaded?.(key);
