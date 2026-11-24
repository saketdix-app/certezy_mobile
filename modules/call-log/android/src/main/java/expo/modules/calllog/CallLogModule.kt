package expo.modules.calllog

import android.Manifest
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the phone's call log (Android only) so the CERTEZY Team app can match
 * calls to leads on the phone. Only calls with a lead's number are ever sent on.
 */
class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CertezyCallLog")

    Function("hasPermission") { granted() }

    // Calls after `since` (ms since 1970), oldest first, at most `limit`
    AsyncFunction("getCalls") { since: Double, limit: Int ->
      val out = mutableListOf<Map<String, Any?>>()
      val context = appContext.reactContext
      if (context == null || !granted()) return@AsyncFunction out
      val projection = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION)
      context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        projection,
        "${CallLog.Calls.DATE} > ?",
        arrayOf(since.toLong().toString()),
        "${CallLog.Calls.DATE} ASC"
      )?.use { c ->
        val iNumber = c.getColumnIndex(CallLog.Calls.NUMBER)
        val iType = c.getColumnIndex(CallLog.Calls.TYPE)
        val iDate = c.getColumnIndex(CallLog.Calls.DATE)
        val iDuration = c.getColumnIndex(CallLog.Calls.DURATION)
        while (c.moveToNext() && out.size < limit) {
          val type = when (c.getInt(iType)) {
            CallLog.Calls.INCOMING_TYPE -> "incoming"
            CallLog.Calls.OUTGOING_TYPE -> "outgoing"
            CallLog.Calls.MISSED_TYPE -> "missed"
            CallLog.Calls.REJECTED_TYPE -> "rejected"
            else -> null
          } ?: continue
          out.add(
            mapOf(
              "number" to (c.getString(iNumber) ?: ""),
              "type" to type,
              "date" to c.getLong(iDate).toDouble(),
              "duration" to c.getLong(iDuration).toInt()
            )
          )
        }
      }
      out
    }
  }

  private fun granted(): Boolean {
    val context = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
  }
}
