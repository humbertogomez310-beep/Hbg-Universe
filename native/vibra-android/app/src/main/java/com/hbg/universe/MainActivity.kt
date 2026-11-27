package com.hbg.universe

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val audioPermissionRequest = 4101
    private val microphonePermissionRequest = 4102

    private val voiceReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                VoiceWakeService.ACTION_COMMAND -> {
                    val text = intent.getStringExtra(VoiceWakeService.EXTRA_TEXT) ?: return
                    dispatchEvent("hbg:voice-command", JSONObject().put("text", text))
                }
                VoiceWakeService.ACTION_STATUS -> {
                    val status = intent.getStringExtra(VoiceWakeService.EXTRA_STATUS) ?: "unknown"
                    dispatchEvent("hbg:voice-status", JSONObject().put("status", status))
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webChromeClient = WebChromeClient()
            webViewClient = LocalOnlyWebViewClient()
            addJavascriptInterface(NativeBridge(), "HBGAndroidBridge")
        }
        setContentView(webView)

        val filter = IntentFilter().apply {
            addAction(VoiceWakeService.ACTION_COMMAND)
            addAction(VoiceWakeService.ACTION_STATUS)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(voiceReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(voiceReceiver, filter)
        }

        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    override fun onDestroy() {
        try { unregisterReceiver(voiceReceiver) } catch (_: IllegalArgumentException) { }
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    private fun audioPermission(): String =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO
        else Manifest.permission.READ_EXTERNAL_STORAGE

    private fun hasAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, audioPermission()) == PackageManager.PERMISSION_GRANTED

    private fun hasMicrophonePermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun requestAudioPermission() {
        if (hasAudioPermission()) {
            dispatchEvent("hbg:audio-permission", JSONObject().put("granted", true))
            return
        }
        runOnUiThread {
            AlertDialog.Builder(this)
                .setTitle("Acceso a tu música")
                .setMessage("VIBRA necesita permiso para descubrir los archivos de audio del dispositivo y organizarlos localmente con Auto DJ. Tus archivos originales no se moverán ni se subirán a servidores.")
                .setNegativeButton("Ahora no") { _, _ ->
                    dispatchEvent("hbg:audio-permission", JSONObject().put("granted", false))
                }
                .setPositiveButton("Continuar") { _, _ ->
                    ActivityCompat.requestPermissions(this, arrayOf(audioPermission()), audioPermissionRequest)
                }
                .show()
        }
    }

    private fun requestMicrophonePermission() {
        if (hasMicrophonePermission()) {
            startVoiceWakeService()
            return
        }
        runOnUiThread {
            AlertDialog.Builder(this)
                .setTitle("Manos Libres")
                .setMessage("Permite el micrófono para que el asistente local detecte «Oye VIBRA», «Oye INSTINTO» u «Oye HBG». La escucha se muestra mediante una notificación y puedes detenerla cuando quieras.")
                .setNegativeButton("Cancelar") { _, _ ->
                    dispatchEvent("hbg:voice-status", JSONObject().put("status", "permission-denied"))
                }
                .setPositiveButton("Permitir") { _, _ ->
                    ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), microphonePermissionRequest)
                }
                .show()
        }
    }

    @Deprecated("Deprecated in Android API 33; retained for runtime permission compatibility")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            audioPermissionRequest -> {
                val granted = hasAudioPermission()
                dispatchEvent("hbg:audio-permission", JSONObject().put("granted", granted))
            }
            microphonePermissionRequest -> {
                if (hasMicrophonePermission()) startVoiceWakeService()
                else dispatchEvent("hbg:voice-status", JSONObject().put("status", "microphone-permission-denied"))
            }
        }
    }

    private fun startVoiceWakeService() {
        if (Build.VERSION.SDK_INT < 31 || !VoiceWakeService.isOnDeviceRecognitionAvailable(this)) {
            dispatchEvent("hbg:voice-status", JSONObject().put("status", "offline-recognition-unavailable"))
            return
        }
        val intent = Intent(this, VoiceWakeService::class.java).setAction(VoiceWakeService.ACTION_START)
        ContextCompat.startForegroundService(this, intent)
    }

    private fun listAudioFiles(): String {
        if (!hasAudioPermission()) return "[]"
        val rows = JSONArray()
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.MIME_TYPE,
        )
        val sortOrder = "${MediaStore.Audio.Media.TITLE} COLLATE NOCASE ASC"
        val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val cursor: Cursor? = contentResolver.query(collection, projection, null, null, sortOrder)
        cursor?.use {
            val idColumn = it.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val nameColumn = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val titleColumn = it.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
            val artistColumn = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            val albumColumn = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
            val durationColumn = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val sizeColumn = it.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
            val mimeColumn = it.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
            while (it.moveToNext()) {
                val id = it.getLong(idColumn)
                val contentUri = ContentUris.withAppendedId(collection, id)
                val displayName = it.getString(nameColumn) ?: "audio-$id"
                val item = JSONObject()
                    .put("id", id.toString())
                    .put("displayName", displayName)
                    .put("title", it.getString(titleColumn) ?: displayName)
                    .put("artist", it.getString(artistColumn) ?: "")
                    .put("album", it.getString(albumColumn) ?: "")
                    .put("durationMs", it.getLong(durationColumn))
                    .put("size", it.getLong(sizeColumn))
                    .put("mimeType", it.getString(mimeColumn) ?: contentResolver.getType(contentUri) ?: "application/octet-stream")
                    .put("url", "https://appassets.androidplatform.net/audio/$id")
                rows.put(item)
            }
        }
        return rows.toString()
    }

    private fun dispatchEvent(name: String, detail: JSONObject) {
        if (!::webView.isInitialized) return
        val safeName = JSONObject.quote(name)
        val safeDetail = detail.toString()
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent($safeName,{detail:$safeDetail}));",
                null,
            )
        }
    }

    private inner class NativeBridge {
        @JavascriptInterface fun hasAudioPermission(): Boolean = this@MainActivity.hasAudioPermission()
        @JavascriptInterface fun requestAudioPermission() = this@MainActivity.requestAudioPermission()
        @JavascriptInterface fun listAudioFiles(): String = this@MainActivity.listAudioFiles()
        @JavascriptInterface fun isVoiceWakeAvailable(): Boolean =
            Build.VERSION.SDK_INT >= 31 && VoiceWakeService.isOnDeviceRecognitionAvailable(this@MainActivity)
        @JavascriptInterface fun startVoiceWake(): Boolean {
            if (!hasMicrophonePermission()) {
                requestMicrophonePermission()
                return false
            }
            startVoiceWakeService()
            return true
        }
        @JavascriptInterface fun stopVoiceWake() {
            stopService(Intent(this@MainActivity, VoiceWakeService::class.java))
        }
    }

    private inner class LocalOnlyWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            val url = request?.url ?: return true
            return url.host != "appassets.androidplatform.net"
        }

        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
            val uri = request?.url ?: return null
            if (uri.host != "appassets.androidplatform.net") return blockedResponse()
            val path = uri.path ?: "/index.html"
            return try {
                if (path.startsWith("/audio/")) {
                    val id = path.removePrefix("/audio/").toLongOrNull() ?: return blockedResponse()
                    val contentUri: Uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
                    val stream = contentResolver.openInputStream(contentUri) ?: return blockedResponse()
                    WebResourceResponse(contentResolver.getType(contentUri) ?: "application/octet-stream", null, stream)
                } else {
                    val assetPath = path.removePrefix("/").ifBlank { "index.html" }
                    val mime = when {
                        assetPath.endsWith(".js") -> "text/javascript"
                        assetPath.endsWith(".css") -> "text/css"
                        assetPath.endsWith(".html") -> "text/html"
                        assetPath.endsWith(".json") || assetPath.endsWith(".webmanifest") -> "application/json"
                        assetPath.endsWith(".svg") -> "image/svg+xml"
                        assetPath.endsWith(".png") -> "image/png"
                        assetPath.endsWith(".jpg") || assetPath.endsWith(".jpeg") -> "image/jpeg"
                        assetPath.endsWith(".webp") -> "image/webp"
                        assetPath.endsWith(".woff2") -> "font/woff2"
                        else -> "application/octet-stream"
                    }
                    WebResourceResponse(mime, "UTF-8", assets.open("web/$assetPath"))
                }
            } catch (_: Exception) {
                blockedResponse()
            }
        }

        private fun blockedResponse() = WebResourceResponse(
            "text/plain",
            "UTF-8",
            404,
            "Not Found",
            emptyMap(),
            ByteArray(0).inputStream(),
        )
    }

    companion object {
        const val AUDIO_PERMISSION_REQUEST = 4101
        const val MICROPHONE_PERMISSION_REQUEST = 4102
    }
}
