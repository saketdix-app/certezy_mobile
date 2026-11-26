package expo.modules.calllog

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.CallLog
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import java.net.HttpURLConnection
import java.net.URL
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the phone's call log (Android only) so the CERTEZY Team app can match
 * calls to leads on the phone. Only calls with a lead's number are ever sent on.
 */
private const val DONE_KEY = "uploaded"

/** Folders the phone makers' dialers save call recordings in (Samsung, Xiaomi, Oppo/Realme/OnePlus, Vivo, Honor…). */
internal fun isCallRecording(path: String, name: String): Boolean {
  val p = path.lowercase()
  return p.contains("call") || p.contains("phonerecord") || name.lowercase().startsWith("call")
}

class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CertezyCallLog")

    Function("hasPermission") { granted() }

    // ── Call recordings made by the phone's own dialer (the app itself can't record calls) ──
    Function("hasAudioPermission") { audioGranted() }

    // Audio files in call-recording folders added after `since` (ms), newest first
    AsyncFunction("findRecordings") { since: Double, limit: Int ->
      val out = mutableListOf<Map<String, Any?>>()
      val context = appContext.reactContext
      if (context == null || !audioGranted()) return@AsyncFunction out
      val pathCol = if (Build.VERSION.SDK_INT >= 29) MediaStore.Audio.Media.RELATIVE_PATH else MediaStore.Audio.Media.DATA
      val projection = arrayOf(
        MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME, MediaStore.Audio.Media.SIZE,
        MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.DATE_MODIFIED, MediaStore.Audio.Media.DURATION,
        MediaStore.Audio.Media.MIME_TYPE, pathCol
      )
      val sinceSec = (since / 1000).toLong()
      context.contentResolver.query(
        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
        projection,
        "(${MediaStore.Audio.Media.DATE_ADDED} >= ? OR ${MediaStore.Audio.Media.DATE_MODIFIED} >= ?)",
        arrayOf(sinceSec.toString(), sinceSec.toString()),
        "${MediaStore.Audio.Media.DATE_ADDED} DESC"
      )?.use { c ->
        val iId = c.getColumnIndex(MediaStore.Audio.Media._ID)
        val iName = c.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME)
        val iSize = c.getColumnIndex(MediaStore.Audio.Media.SIZE)
        val iAdded = c.getColumnIndex(MediaStore.Audio.Media.DATE_ADDED)
        val iModified = c.getColumnIndex(MediaStore.Audio.Media.DATE_MODIFIED)
        val iDuration = c.getColumnIndex(MediaStore.Audio.Media.DURATION)
        val iMime = c.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE)
        val iPath = c.getColumnIndex(pathCol)
        while (c.moveToNext() && out.size < limit) {
          val path = c.getString(iPath) ?: ""
          val name = c.getString(iName) ?: ""
          if (!isCallRecording(path, name)) continue
          val id = c.getLong(iId)
          out.add(
            mapOf(
              "id" to id.toString(),
              "uri" to ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id).toString(),
              "name" to name,
              "path" to path,
              "size" to c.getLong(iSize).toDouble(),
              "added" to (c.getLong(iAdded) * 1000).toDouble(),
              "modified" to (c.getLong(iModified) * 1000).toDouble(),
              "duration" to c.getLong(iDuration).toDouble(),
              "mime" to (c.getString(iMime) ?: "audio/mp4")
            )
          )
        }
      }
      out
    }

    // PUT one recording to its signed upload link; returns the HTTP status
    AsyncFunction("uploadFile") { uri: String, url: String, headers: Map<String, String> ->
      val context = appContext.reactContext ?: return@AsyncFunction 0
      val resolver = context.contentResolver
      val size = resolver.openAssetFileDescriptor(Uri.parse(uri), "r")?.use { it.length } ?: -1L
      val conn = URL(url).openConnection() as HttpURLConnection
      try {
        conn.requestMethod = "PUT"
        conn.doOutput = true
        conn.connectTimeout = 20_000
        conn.readTimeout = 60_000
        headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
        if (size > 0) conn.setFixedLengthStreamingMode(size) else conn.setChunkedStreamingMode(64 * 1024)
        val input = resolver.openInputStream(Uri.parse(uri)) ?: return@AsyncFunction 0
        input.use { inp -> conn.outputStream.use { out -> inp.copyTo(out, 64 * 1024) } }
        conn.responseCode
      } finally {
        conn.disconnect()
      }
    }

    // Which recordings were already uploaded (kept on the phone so each is sent once)
    Function("uploadedRecordings") { prefs()?.getStringSet(DONE_KEY, emptySet())?.toList() ?: emptyList<String>() }
    Function("markRecordingUploaded") { key: String ->
      prefs()?.let { p ->
        val set = HashSet(p.getStringSet(DONE_KEY, emptySet()) ?: emptySet())
        set.add(key)
        p.edit().putStringSet(DONE_KEY, set).apply()
      }
      Unit
    }

    // Sync a few seconds after each call ends, even with the app closed (see CallLogWatcher)
    Function("startWatching") {
      appContext.reactContext?.let { CallLogWatcher.watch(it) }
      Unit
    }
    Function("stopWatching") {
      appContext.reactContext?.let { CallLogWatcher.stop(it) }
      Unit
    }

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

  private fun prefs() = appContext.reactContext?.getSharedPreferences("certezy.callRecordings", Context.MODE_PRIVATE)

  private fun audioGranted(): Boolean {
    val context = appContext.reactContext ?: return false
    val perm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
    return ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED
  }

  private fun granted(): Boolean {
    val context = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
  }
}
