package com.hbg.universe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import java.text.Normalizer
import java.util.Locale

/**
 * Explicitly enabled, on-device-only wake-word listener.
 * It fails closed when Android has no offline speech model; it never falls
 * back to a cloud speech endpoint.
 */
class VoiceWakeService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var target: String? = null

    private val restartListening = Runnable { startListening() }
    private val clearTarget = Runnable {
        target = null
        sendStatus("wake-timeout")
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        if (!isOnDeviceRecognitionAvailable(this)) {
            sendStatus("offline-recognition-unavailable")
            stopSelf()
            return START_NOT_STICKY
        }
        if (!listening) initializeRecognizer()
        return START_STICKY
    }

    private fun initializeRecognizer() {
        try {
            recognizer = if (Build.VERSION.SDK_INT >= 31) {
                SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
            } else {
                null
            }
            if (recognizer == null) {
                sendStatus("offline-recognition-unavailable")
                stopSelf()
                return
            }
            recognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    listening = true
                    sendStatus(if (target == null) "listening-wake-word" else "listening-command")
                }
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() { listening = false }
                override fun onError(error: Int) {
                    listening = false
                    if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                        sendStatus("microphone-permission-denied")
                        stopSelf()
                    } else {
                        scheduleRestart()
                    }
                }
                override fun onResults(results: Bundle?) {
                    listening = false
                    val transcript = results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        .orEmpty()
                    if (transcript.isNotBlank()) processTranscript(transcript)
                    scheduleRestart()
                }
                override fun onPartialResults(partialResults: Bundle?) = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
            startListening()
        } catch (_: Exception) {
            sendStatus("offline-recognition-unavailable")
            stopSelf()
        }
    }

    private fun startListening() {
        if (recognizer == null || listening) return
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-MX")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "es-MX")
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        }
        try {
            recognizer?.startListening(intent)
            listening = true
        } catch (_: Exception) {
            listening = false
            scheduleRestart()
        }
    }

    private fun processTranscript(transcript: String) {
        val normalized = normalize(transcript)
        val currentTarget = target
        if (currentTarget != null) {
            handler.removeCallbacks(clearTarget)
            sendCommand("Oye ${currentTarget.uppercase(Locale.ROOT)} $normalized")
            target = null
            return
        }
        detectWakePhrase(normalized, dispatchCommand = true)
    }

    private fun detectWakePhrase(value: String, dispatchCommand: Boolean) {
        val normalized = normalize(value)
        val match = Regex("\\b(?:oye|hey|hola)\\s+(vibra|instinto|hbg)\\b").find(normalized) ?: return
        val selectedTarget = match.groupValues[1]
        val remainder = normalized.substring(match.range.last + 1).trim()
        if (remainder.isNotEmpty() && dispatchCommand) {
            sendCommand("Oye ${selectedTarget.uppercase(Locale.ROOT)} $remainder")
            target = null
            return
        }
        target = selectedTarget
        handler.removeCallbacks(clearTarget)
        handler.postDelayed(clearTarget, COMMAND_WINDOW_MS)
        sendStatus("wake-$selectedTarget")
    }

    private fun normalize(value: String): String =
        Normalizer.normalize(value.lowercase(Locale.ROOT), Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .replace(Regex("[^\\p{L}\\p{N}\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun scheduleRestart() {
        if (target != null) {
            handler.removeCallbacks(clearTarget)
            handler.postDelayed(clearTarget, COMMAND_WINDOW_MS)
        }
        handler.removeCallbacks(restartListening)
        handler.postDelayed(restartListening, RESTART_DELAY_MS)
    }

    private fun sendCommand(text: String) {
        sendBroadcast(Intent(ACTION_COMMAND).setPackage(packageName).putExtra(EXTRA_TEXT, text))
        sendStatus("command-received")
    }

    private fun sendStatus(status: String) {
        sendBroadcast(Intent(ACTION_STATUS).setPackage(packageName).putExtra(EXTRA_STATUS, status))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Manos Libres HBG", NotificationManager.IMPORTANCE_LOW)
                .apply { description = "Indica cuándo la activación por voz local está habilitada." },
        )
    }

    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, VoiceWakeService::class.java).setAction(ACTION_STOP)
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Manos Libres HBG activo")
            .setContentText("Escucha local «Oye VIBRA», «Oye INSTINTO» y «Oye HBG».")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_media_pause, "Detener", stopPendingIntent)
            .build()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        try { recognizer?.cancel() } catch (_: Exception) { }
        try { recognizer?.destroy() } catch (_: Exception) { }
        recognizer = null
        listening = false
        sendStatus("stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_START = "com.hbg.universe.voice.START"
        const val ACTION_STOP = "com.hbg.universe.voice.STOP"
        const val ACTION_COMMAND = "com.hbg.universe.voice.COMMAND"
        const val ACTION_STATUS = "com.hbg.universe.voice.STATUS"
        const val EXTRA_TEXT = "transcript"
        const val EXTRA_STATUS = "status"
        private const val CHANNEL_ID = "hbg_hands_free"
        private const val NOTIFICATION_ID = 8102
        private const val RESTART_DELAY_MS = 450L
        private const val COMMAND_WINDOW_MS = 8_000L

        fun isOnDeviceRecognitionAvailable(context: Context): Boolean =
            Build.VERSION.SDK_INT >= 31 &&
                SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    }
}
