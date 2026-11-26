package expo.modules.calllog

import android.content.Context
import android.provider.CallLog
import android.provider.MediaStore
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import expo.modules.interfaces.taskManager.TaskExecutionCallback
import expo.modules.interfaces.taskManager.TaskServiceProviderHelper
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.TimeUnit

/**
 * Sends lead calls to the server a few seconds after a call ends, even when the
 * app is closed: Android wakes this worker when the phone's call log changes
 * (a content-URI trigger — no extra permission). It runs the app's background
 * task ("certezy-call-log-sync", see src/backgroundCallSync.ts), which reads the
 * call log, keeps only calls with a lead's number and uploads them, plus the
 * phone dialer's recordings of those calls. It also wakes when a new audio file
 * is saved, so a recording finished after the call log entry is caught too.
 * The ~15-minute background check stays as a fallback.
 */
object CallLogWatcher {
  private const val WORK = "certezy-call-log-changed"
  private const val TAG = "CertezyCallLogWatcher"

  /**
   * Wait for the next change to the call log. From the app: keep an existing
   * watch. From the worker itself: queue the next watch after this run.
   */
  fun watch(context: Context, fromWorker: Boolean = false) {
    val constraints = Constraints.Builder()
      .addContentUriTrigger(CallLog.Calls.CONTENT_URI, true)
      // …and when the dialer saves a call recording
      .addContentUriTrigger(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, true)
      // Let the dialer finish writing (duration etc.), then go within half a minute
      .setTriggerContentUpdateDelay(3, TimeUnit.SECONDS)
      .setTriggerContentMaxDelay(30, TimeUnit.SECONDS)
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()
    val request = OneTimeWorkRequestBuilder<CallLogChangedWorker>().setConstraints(constraints).build()
    WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
      WORK,
      if (fromWorker) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP,
      request
    )
  }

  fun stop(context: Context) {
    WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK)
  }

  /** Run the app's registered background task(s) once, now. */
  suspend fun runAppTask(context: Context) {
    val service = TaskServiceProviderHelper.getTaskServiceImpl(context.applicationContext) ?: return
    val consumers = service.getTaskConsumers(context.packageName).filter { it.taskType() == "expo-background-task" }
    if (consumers.isEmpty()) {
      Log.d(TAG, "No background task registered (call sync off or signed out)")
      return
    }
    for (consumer in consumers) {
      val done = CompletableDeferred<Unit>()
      try {
        // BackgroundTaskConsumer.executeTask(callback) — the same call expo-background-task's worker makes
        consumer.javaClass
          .getMethod("executeTask", TaskExecutionCallback::class.java)
          .invoke(consumer, TaskExecutionCallback { done.complete(Unit) })
        withTimeoutOrNull(60_000) { done.await() }
      } catch (e: Exception) {
        Log.w(TAG, "Call sync task failed: ${e.message}")
      }
    }
  }
}

class CallLogChangedWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    // Keep watching for the next call first, whatever happens below
    CallLogWatcher.watch(applicationContext, fromWorker = true)
    CallLogWatcher.runAppTask(applicationContext)
    return Result.success()
  }
}
