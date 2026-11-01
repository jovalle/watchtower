package io.github.jovalle.watchtower.tv.api

import kotlinx.serialization.Serializable

// Wire DTOs for Watchtower native API v1. Source of truth: app/lib/native/contract.ts and
// contracts/native/v1 fixtures. Positions/durations are milliseconds; IDs are server-scoped strings.

@Serializable
data class ErrorEnvelope(val error: ErrorBody)

@Serializable
data class ErrorBody(val code: String, val message: String, val retryable: Boolean, val requestId: String)

@Serializable
data class Page<T>(val items: List<T>, val nextCursor: String?, val totalCount: Int?)

@Serializable
data class Items<T>(val items: List<T>)

@Serializable
data class InstanceResponse(
    val apiVersion: Int,
    val product: String,
    val serverVersion: String,
    val configured: Boolean,
    val features: InstanceFeatures,
    val compatibility: Compatibility,
    val pairing: PairingInfo,
)

@Serializable
data class InstanceFeatures(val pairing: Boolean, val profiles: Boolean, val rooms: Boolean)

@Serializable
data class Compatibility(val minClientVersionCode: Int?, val upgradeMessage: String?)

@Serializable
data class PairingInfo(val verificationPath: String)

@Serializable
data class CreateDeviceAuthorizationRequest(
    val deviceName: String,
    val platform: String = "android-tv",
    val model: String?,
    val appVersion: String?,
)

@Serializable
data class DeviceAuthorizationResponse(
    val userCode: String,
    val verificationUri: String,
    val verificationUriComplete: String,
    val pollingSecret: String,
    val expiresInMs: Long,
    val intervalMs: Long,
)

@Serializable
data class PollDeviceAuthorizationRequest(val pollingSecret: String)

/** status: pending | denied | expired | approved. Other fields are present only for their status. */
@Serializable
data class PollDeviceAuthorizationResponse(
    val status: String,
    val intervalMs: Long? = null,
    val expiresInMs: Long? = null,
    val session: DeviceSessionGrant? = null,
    val me: MeResponse? = null,
)

@Serializable
data class DeviceSessionGrant(
    val accessToken: String,
    val tokenType: String,
    val deviceSessionId: String,
    val expiresAtMs: Long,
    val expiresInMs: Long,
    val identityVersion: Long,
)

@Serializable
data class ProfileSummary(
    val userId: String,
    val title: String,
    val restricted: Boolean,
    val owner: Boolean,
    val protected: Boolean,
)

@Serializable
data class MeResponse(
    val deviceSessionId: String,
    val identityVersion: Long,
    val expiresAtMs: Long,
    val server: ServerInfo,
    val account: AccountInfo,
    val profile: ProfileSummary,
    val features: MeFeatures,
)

@Serializable
data class ServerInfo(val machineId: String, val name: String)

@Serializable
data class AccountInfo(val userId: String, val title: String)

@Serializable
data class MeFeatures(val profiles: Boolean, val requests: Boolean, val discovery: Boolean, val rooms: Boolean)

@Serializable
data class DeviceSummary(
    val deviceSessionId: String,
    val name: String,
    val platform: String,
    val model: String?,
    val appVersion: String?,
    val createdAtMs: Long,
    val lastSeenAtMs: Long?,
    val expiresAtMs: Long,
    val current: Boolean,
)

@Serializable
data class HomeProfile(
    val profileId: String,
    val title: String,
    val restricted: Boolean,
    val protected: Boolean,
    val admin: Boolean,
    val current: Boolean,
)

@Serializable
data class SwitchProfileRequest(val profileId: String, val pin: String?, val expectedIdentityVersion: Long)

@Serializable
data class ExternalId(val provider: String, val id: String, val type: String)

@Serializable
data class MediaSummary(
    val ratingKey: String?,
    val type: String,
    val title: String,
    val year: Int?,
    val posterUrl: String?,
    val backdropUrl: String?,
    val thumbUrl: String?,
    val durationMs: Long?,
    val viewOffsetMs: Long?,
    val viewCount: Int,
    val leafCount: Int?,
    val viewedLeafCount: Int?,
    val contentRating: String?,
    val showTitle: String?,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val parentRatingKey: String?,
    val grandparentRatingKey: String?,
    val external: ExternalId?,
)

@Serializable
data class HomeRow(val id: String, val kind: String, val title: String, val items: List<MediaSummary>)

@Serializable
data class HomeResponse(val hero: List<MediaSummary>, val rows: List<HomeRow>, val errors: List<String>)

@Serializable
data class LibrarySection(val sectionId: String, val type: String, val title: String)

@Serializable
data class LibraryFiltersResponse(val genres: List<String>, val years: List<Int>)

@Serializable
data class Marker(val type: String, val startMs: Long, val endMs: Long, val final: Boolean)

@Serializable
data class AudioTrack(
    val streamId: String,
    val title: String,
    val language: String?,
    val languageCode: String?,
    val codec: String?,
    val channels: Int?,
    val default: Boolean,
    val selected: Boolean,
    val audioDescription: Boolean,
)

@Serializable
data class SubtitleTrack(
    val streamId: String,
    val title: String,
    val language: String?,
    val languageCode: String?,
    val codec: String?,
    /** text | styled | image | unknown */
    val format: String,
    val external: Boolean,
    val forced: Boolean,
    val hearingImpaired: Boolean,
    val default: Boolean,
    val selected: Boolean,
)

@Serializable
data class MediaPart(
    val partId: String,
    val index: Int,
    val durationMs: Long?,
    val container: String?,
    val sizeBytes: Long?,
)

@Serializable
data class MediaVersion(
    val mediaId: String,
    val label: String,
    val container: String?,
    val videoCodec: String?,
    val videoProfile: String?,
    val videoResolution: String?,
    val width: Int?,
    val height: Int?,
    val frameRate: Double?,
    val bitDepth: Int?,
    val hdr: String?,
    val bitrateKbps: Int?,
    val audioCodec: String?,
    val audioChannels: Int?,
    val durationMs: Long?,
    val parts: List<MediaPart>,
    val audioTracks: List<AudioTrack>,
    val subtitleTracks: List<SubtitleTrack>,
)

@Serializable
data class Person(val name: String, val role: String?, val thumbUrl: String?)

@Serializable
data class Edition(val ratingKey: String, val editionTitle: String?)

@Serializable
data class Guids(val imdb: String?, val tmdb: String?, val tvdb: String?, val plex: String?)

@Serializable
data class MediaDetail(
    val ratingKey: String?,
    val type: String,
    val title: String,
    val year: Int?,
    val posterUrl: String?,
    val backdropUrl: String?,
    val thumbUrl: String?,
    val durationMs: Long?,
    val viewOffsetMs: Long?,
    val viewCount: Int,
    val leafCount: Int?,
    val viewedLeafCount: Int?,
    val contentRating: String?,
    val showTitle: String?,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val parentRatingKey: String?,
    val grandparentRatingKey: String?,
    val external: ExternalId?,
    val summary: String?,
    val tagline: String?,
    val studio: String?,
    val genres: List<String>,
    val directors: List<String>,
    val cast: List<Person>,
    val audienceRating: Double?,
    val criticRating: Double?,
    val userRating: Double?,
    val originallyAvailableAt: String?,
    val editionTitle: String?,
    val editions: List<Edition>,
    val guids: Guids,
    val versions: List<MediaVersion>,
    val markers: List<Marker>,
    val onWatchlist: Boolean?,
    val playable: Boolean,
) {
    fun toSummary() = MediaSummary(
        ratingKey, type, title, year, posterUrl, backdropUrl, thumbUrl, durationMs, viewOffsetMs, viewCount,
        leafCount, viewedLeafCount, contentRating, showTitle, seasonNumber, episodeNumber, parentRatingKey,
        grandparentRatingKey, external,
    )
}

@Serializable
data class AdjacentResponse(val previous: MediaSummary?, val next: MediaSummary?)

@Serializable
data class SearchResponse(val library: List<MediaSummary>, val external: List<MediaSummary>)

@Serializable
data class WatchlistItem(
    val id: String,
    val title: String,
    val type: String,
    val year: Int?,
    val posterUrl: String?,
    val sources: List<String>,
    val ratingKey: String?,
    val plexGuid: String?,
    val external: ExternalId?,
    val imdbId: String?,
    val addedAtMs: Long?,
)

@Serializable
data class WatchlistCounts(val all: Int, val plex: Int, val trakt: Int, val imdb: Int)

@Serializable
data class WatchlistResponse(val items: List<WatchlistItem>, val counts: WatchlistCounts, val errors: List<String>)

@Serializable
data class WatchlistMutationRequest(val ratingKey: String?, val plexGuid: String?)

@Serializable
data class PlaylistSummary(
    val playlistId: String,
    val title: String,
    val itemCount: Int,
    val durationMs: Long?,
    val smart: Boolean,
    val thumbUrl: String?,
)

@Serializable
data class PlaylistItem(
    val ratingKey: String?,
    val type: String,
    val title: String,
    val year: Int?,
    val posterUrl: String?,
    val backdropUrl: String?,
    val thumbUrl: String?,
    val durationMs: Long?,
    val viewOffsetMs: Long?,
    val viewCount: Int,
    val leafCount: Int?,
    val viewedLeafCount: Int?,
    val contentRating: String?,
    val showTitle: String?,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val parentRatingKey: String?,
    val grandparentRatingKey: String?,
    val external: ExternalId?,
    val playlistItemId: String,
)

@Serializable
data class CollectionSummary(val collectionId: String, val title: String, val itemCount: Int, val thumbUrl: String?)

@Serializable
data class RatingKeyBody(val ratingKey: String)

@Serializable
data class RatingBody(val rating: Double?)

@Serializable
data class Preferences(
    val autoSkipIntro: Boolean,
    val autoPlayNextEpisode: Boolean,
    val showContinueWatching: Boolean,
    val showRecentlyAdded: Boolean,
    val showTrending: Boolean,
    val showCollections: Boolean,
    val discoveryDisabled: Boolean,
)

@Serializable
data class RequestEntry(val id: Int, val status: String, val is4k: Boolean, val mine: Boolean)

@Serializable
data class SeasonAvailability(val number: Int, val status: String, val status4k: String)

@Serializable
data class RequestAvailability(
    val status: String,
    val status4k: String,
    val requests: List<RequestEntry>,
    val seasons: List<SeasonAvailability>,
)

@Serializable
data class CreateRequestBody(val type: String, val tmdbId: Int)

@Serializable
data class CreateIssueBody(val type: String, val tmdbId: Int, val issueType: Int, val message: String)

@Serializable
data class DeviceCapabilities(
    val schemaVersion: Int = 1,
    val device: CapabilityDevice,
    val display: CapabilityDisplay,
    val video: List<VideoCapability>,
    val audio: List<AudioCapability>,
    val containers: List<String>,
    val subtitles: List<String>,
    val audioOutput: AudioOutputCapability,
    val maxVideoBitrateKbps: Int?,
)

@Serializable
data class CapabilityDevice(val manufacturer: String, val model: String, val sdkInt: Int)

@Serializable
data class CapabilityDisplay(val widthPx: Int, val heightPx: Int, val refreshRatesHz: List<Double>, val hdrTypes: List<String>)

@Serializable
data class VideoCapability(
    val codec: String,
    val profiles: List<String>,
    val maxWidth: Int,
    val maxHeight: Int,
    val maxFrameRate: Double?,
    val maxBitrateKbps: Int?,
    val tenBit: Boolean,
    val hdrTypes: List<String>,
)

@Serializable
data class AudioCapability(val codec: String, val maxChannels: Int, val passthrough: Boolean)

@Serializable
data class AudioOutputCapability(val type: String, val maxChannels: Int)

@Serializable
data class PlaybackRequest(
    val ratingKey: String,
    val mediaId: String?,
    val startPositionMs: Long?,
    val audioStreamId: String?,
    val subtitleStreamId: String?,
    val subtitlesOff: Boolean,
    val quality: String,
    val forceTranscode: Boolean,
    val capabilities: DeviceCapabilities,
    val replacesPlaybackId: String?,
    /** start | quality_change | track_change | seek_reload | decoder_fallback | part_change | retry */
    val reason: String,
)

@Serializable
data class MediaIdentity(val serverMachineId: String, val ratingKey: String, val mediaId: String, val partId: String)

@Serializable
data class PlexDecision(val video: String?, val audio: String?, val subtitle: String?)

@Serializable
data class PlaybackPart(val partId: String, val index: Int, val startMs: Long, val durationMs: Long, val url: String?)

@Serializable
data class TimelineMapping(
    /** absolute | offset_relative | unknown */
    val mapping: String,
    val requestedOffsetMs: Long,
)

@Serializable
data class Delivery(
    /** file | hls */
    val type: String,
    /** direct_play | direct_stream | transcode */
    val method: String,
    val plexDecision: PlexDecision?,
    val mimeType: String,
    val parts: List<PlaybackPart>,
    val activePartIndex: Int,
    val timeline: TimelineMapping,
)

@Serializable
data class SourceInfo(
    val videoCodec: String?,
    val width: Int?,
    val height: Int?,
    val hdr: String?,
    val bitrateKbps: Int?,
    val audioCodec: String?,
    val audioChannels: Int?,
    val container: String?,
)

@Serializable
data class QualityOption(val id: String, val label: String, val maxBitrateKbps: Int?, val resolution: String?)

@Serializable
data class TranscodeTarget(val maxBitrateKbps: Int?, val resolution: String?)

@Serializable
data class QualityInfo(val requested: String, val options: List<QualityOption>, val transcodeTarget: TranscodeTarget?)

@Serializable
data class PlaybackTracks(
    val audio: List<AudioTrack>,
    val subtitles: List<SubtitleTrack>,
    val selectedAudioStreamId: String?,
    val selectedSubtitleStreamId: String?,
    /** none | embedded | sidecar | burned */
    val subtitleDelivery: String,
    val sidecarUrl: String?,
)

@Serializable
data class Autoplay(val autoSkipIntro: Boolean, val autoPlayNextEpisode: Boolean)

@Serializable
data class PlaybackDescriptor(
    val playbackId: String,
    val expiresInMs: Long,
    val media: MediaIdentity,
    val item: MediaSummary,
    val durationMs: Long,
    val startPositionMs: Long,
    val resumeSource: String,
    val delivery: Delivery,
    val source: SourceInfo,
    val quality: QualityInfo,
    val tracks: PlaybackTracks,
    val markers: List<Marker>,
    val nextItem: MediaSummary?,
    val previousItem: MediaSummary?,
    val autoplay: Autoplay,
    val heartbeatIntervalMs: Long,
    val timelineIntervalMs: Long,
    val diagnostics: List<String>,
)

@Serializable
data class TimelineRequest(val state: String, val positionMs: Long, val durationMs: Long, val sequence: Long)

@Serializable
data class TimelineResponse(val accepted: Boolean)

@Serializable
data class StopPlaybackRequest(val positionMs: Long?, val durationMs: Long?, val sequence: Long?)
