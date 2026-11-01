package io.github.jovalle.watchtower.tv.platform

import android.content.Context
import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

object VoiceSearch {
    fun isAvailable(context: Context): Boolean {
        val intent = intent()
        return SpeechRecognizer.isRecognitionAvailable(context) && intent.resolveActivity(context.packageManager) != null
    }

    fun intent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_PROMPT, "Search Watchtower")
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }

    fun firstResult(intent: Intent?): String? =
        intent?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim()?.takeIf(String::isNotEmpty)
}