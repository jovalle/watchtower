package io.github.jovalle.watchtower.tv.platform

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.media.tv.TvContract
import androidx.tvprovider.media.tv.TvContractCompat
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.ProfileSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class WatchNextEntry(
    val ratingKey: String,
    val title: String,
    val intentUri: String,
    val posterUri: String?,
    val durationMs: Long?,
    val positionMs: Long?,
)

interface WatchNextSink {
    suspend fun publish(entry: WatchNextEntry)
    suspend fun remove(ratingKey: String)
    suspend fun removeAll()
}

class WatchNextManager(private val sink: WatchNextSink) {
    suspend fun sync(profile: ProfileSummary, serverMachineId: String, continueWatching: List<MediaSummary>) {
        if (profile.restricted || profile.protected) {
            sink.removeAll()
            return
        }
        continueWatching.forEach { item ->
            val ratingKey = item.ratingKey ?: return@forEach
            if (item.viewCount > 0) {
                sink.remove(ratingKey)
            } else {
                sink.publish(
                    WatchNextEntry(
                        ratingKey = ratingKey,
                        title = item.title,
                        intentUri = "watchtower://media/$ratingKey?server=$serverMachineId&action=play",
                        posterUri = item.posterUrl ?: item.backdropUrl,
                        durationMs = item.durationMs,
                        positionMs = item.viewOffsetMs,
                    ),
                )
            }
        }
    }

    suspend fun identityChanged() = sink.removeAll()
}

class AndroidWatchNextSink(private val context: Context) : WatchNextSink {
    override suspend fun publish(entry: WatchNextEntry) = withContext(Dispatchers.IO) {
        runCatching {
            removeInternal(entry.ratingKey)
            val values = ContentValues().apply {
                put(TvContract.WatchNextPrograms.COLUMN_TITLE, entry.title)
                put(TvContract.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID, internalId(entry.ratingKey))
                put(TvContract.WatchNextPrograms.COLUMN_INTENT_URI, entry.intentUri)
                put(
                    TvContract.WatchNextPrograms.COLUMN_WATCH_NEXT_TYPE,
                    TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE,
                )
                put(TvContract.WatchNextPrograms.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS, System.currentTimeMillis())
                entry.posterUri?.let { put(TvContract.WatchNextPrograms.COLUMN_POSTER_ART_URI, it) }
                entry.durationMs?.coerceAtMost(Int.MAX_VALUE.toLong())?.toInt()?.let {
                    put(TvContract.WatchNextPrograms.COLUMN_DURATION_MILLIS, it)
                }
                entry.positionMs?.coerceAtMost(Int.MAX_VALUE.toLong())?.toInt()?.let {
                    put(TvContract.WatchNextPrograms.COLUMN_LAST_PLAYBACK_POSITION_MILLIS, it)
                }
            }
            context.contentResolver.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, values)
        }
        Unit
    }

    override suspend fun remove(ratingKey: String) = withContext(Dispatchers.IO) {
        runCatching { removeInternal(ratingKey) }
        Unit
    }

    override suspend fun removeAll() = withContext(Dispatchers.IO) {
        runCatching {
            val resolver = context.contentResolver
            resolver.query(
                TvContractCompat.WatchNextPrograms.CONTENT_URI,
                arrayOf(TvContract.WatchNextPrograms._ID, TvContract.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID),
                null,
                null,
                null,
            )?.use { cursor ->
                val idColumn = cursor.getColumnIndexOrThrow(TvContract.WatchNextPrograms._ID)
                val providerColumn = cursor.getColumnIndexOrThrow(TvContract.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID)
                while (cursor.moveToNext()) {
                    if (cursor.getString(providerColumn)?.startsWith(INTERNAL_PREFIX) == true) {
                        resolver.delete(ContentUris.withAppendedId(TvContractCompat.WatchNextPrograms.CONTENT_URI, cursor.getLong(idColumn)), null, null)
                    }
                }
            }
        }
        Unit
    }

    private fun removeInternal(ratingKey: String) {
        context.contentResolver.delete(
            TvContractCompat.WatchNextPrograms.CONTENT_URI,
            "${TvContract.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID} = ?",
            arrayOf(internalId(ratingKey)),
        )
    }

    private fun internalId(ratingKey: String) = "$INTERNAL_PREFIX$ratingKey"

    private companion object {
        const val INTERNAL_PREFIX = "watchtower:"
    }
}