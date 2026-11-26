import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { loadToken } from "./api";
import { callSyncOn, syncCalls } from "./callSync";
import { startCallLogWatch, stopCallLogWatch } from "../modules/call-log";

/**
 * Checks the call log in the background, so calls made from the phone's dialer
 * reach the lead's history without opening the app:
 *  • a few seconds after each call ends — Android wakes the app when the call
 *    log changes (modules/call-log CallLogWatcher runs this same task);
 *  • and about every 15 minutes as a fallback.
 * Defined when this file loads (imported from app/_layout).
 */
const TASK = "certezy-call-log-sync";

TaskManager.defineTask(TASK, async () => {
  try {
    if (!(await loadToken())) return BackgroundTask.BackgroundTaskResult.Success; // signed out
    await syncCalls();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Start (or keep) the background check when syncing is on; stop it otherwise. */
export async function updateBackgroundCallSync() {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK);
    if (await callSyncOn()) {
      if (!registered) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
      startCallLogWatch();
    } else {
      stopCallLogWatch();
      if (registered) await BackgroundTask.unregisterTaskAsync(TASK);
    }
  } catch (e: any) {
    console.warn("Background call sync not available:", e?.message);
  }
}

export async function stopBackgroundCallSync() {
  stopCallLogWatch();
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch {
    // nothing to stop
  }
}
