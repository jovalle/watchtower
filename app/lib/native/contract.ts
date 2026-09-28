/**
 * Watchtower native client API v1 wire contract (TV track owner).
 * Mirrors docs/handoffs/android-tv/CONTRACT.md and contracts/native/v1 fixtures.
 * Types only: every route validates input at runtime. Times/positions are integer milliseconds,
 * IDs are server-scoped strings, and nullable fields mean "unknown or not applicable".
 */

export const NATIVE_API_VERSION = 1;
export const IDENTITY_VERSION_HEADER = "X-Watchtower-Identity-Version";
export const REQUEST_ID_HEADER = "X-Request-Id";

export type ErrorCode =
  | "invalid_request"
  | "invalid_cursor"
  | "unsupported_media_type"
  | "payload_too_large"
  | "ambiguous_credentials"
  | "unauthenticated"
  | "session_expired"
  | "session_revoked"
  | "server_changed"
  | "upstream_auth_failed"
  | "forbidden"
  | "pin_required"
  | "invalid_pin"
  | "requests_not_linked"
  | "not_found"
  | "authorization_not_found"
  | "method_not_allowed"
  | "identity_version_mismatch"
  | "conflict"
  | "playback_session_expired"
  | "unsupported_media"
  | "rate_limited"
  | "slow_down"
  | "feature_unavailable"
  | "not_configured"
  | "upstream_unavailable"
  | "internal_error";

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; retryable: boolean; requestId: string };
}

export interface Page<T> {
  items: T[];
  /** Opaque; valid only with the same path and query. null means no further page. */
  nextCursor: string | null;
  totalCount: number | null;
}

export interface InstanceResponse {
  apiVersion: 1;
  product: "Watchtower";
  serverVersion: string;
  configured: boolean;
  features: { pairing: boolean; profiles: boolean; rooms: boolean };
  compatibility: { minClientVersionCode: number | null; upgradeMessage: string | null };
  pairing: { verificationPath: string };
}

export type DevicePlatform = "android-tv";

export interface CreateDeviceAuthorizationRequest {
  deviceName: string;
  platform: DevicePlatform;
  model: string | null;
  appVersion: string | null;
}

export interface DeviceAuthorizationResponse {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  pollingSecret: string;
  expiresInMs: number;
  intervalMs: number;
}

export interface PollDeviceAuthorizationRequest {
  pollingSecret: string;
}

export interface DeviceSessionGrant {
  accessToken: string;
  tokenType: "Bearer";
  deviceSessionId: string;
  expiresAtMs: number;
  expiresInMs: number;
  identityVersion: number;
}

export type PollDeviceAuthorizationResponse =
  | { status: "pending"; intervalMs: number; expiresInMs: number }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; session: DeviceSessionGrant; me: MeResponse };

export interface ProfileSummary {
  userId: string;
  title: string;
  restricted: boolean;
  owner: boolean;
  protected: boolean;
}

export interface MeResponse {
  deviceSessionId: string;
  identityVersion: number;
  expiresAtMs: number;
  server: { machineId: string; name: string };
  account: { userId: string; title: string };
  profile: ProfileSummary;
  features: { profiles: boolean; requests: boolean; discovery: boolean; rooms: boolean };
}

export interface DeviceSummary {
  deviceSessionId: string;
  name: string;
  platform: DevicePlatform;
  model: string | null;
  appVersion: string | null;
  createdAtMs: number;
  lastSeenAtMs: number | null;
  expiresAtMs: number;
  current: boolean;
}

export interface HomeProfile {
  profileId: string;
  title: string;
  restricted: boolean;
  protected: boolean;
  admin: boolean;
  current: boolean;
}

export interface ProfilesResponse {
  items: HomeProfile[];
}

export interface SwitchProfileRequest {
  profileId: string;
  pin: string | null;
  expectedIdentityVersion: number;
}

export type MediaType = "movie" | "show" | "season" | "episode";

export interface ExternalId {
  provider: "tmdb";
  id: string;
  type: "movie" | "show";
}

export interface MediaSummary {
  /** null only for external (not in library) titles. */
  ratingKey: string | null;
  type: MediaType;
  title: string;
  year: number | null;
  /** Same-origin relative image paths (authenticated), never upstream URLs or credentials. */
  posterUrl: string | null;
  backdropUrl: string | null;
  thumbUrl: string | null;
  durationMs: number | null;
  viewOffsetMs: number | null;
  viewCount: number;
  leafCount: number | null;
  viewedLeafCount: number | null;
  contentRating: string | null;
  showTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  parentRatingKey: string | null;
  grandparentRatingKey: string | null;
  external: ExternalId | null;
}

export type HomeRowKind =
  | "continue_watching"
  | "next_episodes"
  | "recently_added"
  | "recommendations"
  | "trending"
  | "collection";

export interface HomeRow {
  id: string;
  kind: HomeRowKind;
  title: string;
  items: MediaSummary[];
}

export interface HomeResponse {
  hero: MediaSummary[];
  rows: HomeRow[];
  /** Safe, user-facing partial-failure messages. */
  errors: string[];
}

export interface LibrarySection {
  sectionId: string;
  type: "movie" | "show";
  title: string;
}

export type LibrarySort =
  | "titleSort:asc"
  | "titleSort:desc"
  | "addedAt:desc"
  | "originallyAvailableAt:desc"
  | "audienceRating:desc"
  | "lastViewedAt:desc";

export type LibraryFilter = "all" | "unwatched" | "in_progress";

export interface LibraryFiltersResponse {
  genres: string[];
  years: number[];
}

export interface Marker {
  type: "intro" | "credits";
  startMs: number;
  endMs: number;
  final: boolean;
}

export type SubtitleFormat = "text" | "styled" | "image" | "unknown";
export type HdrType = "hdr10" | "hdr10plus" | "hlg" | "dolby-vision";

export interface AudioTrack {
  streamId: string;
  title: string;
  language: string | null;
  languageCode: string | null;
  codec: string | null;
  channels: number | null;
  default: boolean;
  selected: boolean;
  audioDescription: boolean;
}

export interface SubtitleTrack {
  streamId: string;
  title: string;
  language: string | null;
  languageCode: string | null;
  codec: string | null;
  format: SubtitleFormat;
  external: boolean;
  forced: boolean;
  hearingImpaired: boolean;
  default: boolean;
  selected: boolean;
}

export interface MediaPart {
  partId: string;
  index: number;
  durationMs: number | null;
  container: string | null;
  sizeBytes: number | null;
}

export interface MediaVersion {
  mediaId: string;
  label: string;
  container: string | null;
  videoCodec: string | null;
  videoProfile: string | null;
  videoResolution: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  bitDepth: number | null;
  hdr: HdrType | null;
  bitrateKbps: number | null;
  audioCodec: string | null;
  audioChannels: number | null;
  durationMs: number | null;
  parts: MediaPart[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}

export interface Person {
  name: string;
  role: string | null;
  thumbUrl: string | null;
}

export interface MediaDetail extends MediaSummary {
  summary: string | null;
  tagline: string | null;
  studio: string | null;
  genres: string[];
  directors: string[];
  cast: Person[];
  audienceRating: number | null;
  criticRating: number | null;
  userRating: number | null;
  originallyAvailableAt: string | null;
  editionTitle: string | null;
  /** Sibling library items with the same Plex GUID (movie editions), excluding this one. */
  editions: Array<{ ratingKey: string; editionTitle: string | null }>;
  guids: { imdb: string | null; tmdb: string | null; tvdb: string | null; plex: string | null };
  versions: MediaVersion[];
  markers: Marker[];
  onWatchlist: boolean | null;
  playable: boolean;
}

export interface AdjacentResponse {
  previous: MediaSummary | null;
  next: MediaSummary | null;
}

export interface SearchResponse {
  library: MediaSummary[];
  external: MediaSummary[];
}

export type WatchlistSource = "plex" | "trakt" | "imdb";

export interface WatchlistItem {
  id: string;
  title: string;
  type: "movie" | "show";
  year: number | null;
  posterUrl: string | null;
  sources: WatchlistSource[];
  ratingKey: string | null;
  plexGuid: string | null;
  external: ExternalId | null;
  imdbId: string | null;
  addedAtMs: number | null;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  counts: { all: number; plex: number; trakt: number; imdb: number };
  errors: string[];
}

export interface WatchlistMutationRequest {
  /** Exactly one of ratingKey or plexGuid. */
  ratingKey: string | null;
  plexGuid: string | null;
}

export interface PlaylistSummary {
  playlistId: string;
  title: string;
  itemCount: number;
  durationMs: number | null;
  smart: boolean;
  thumbUrl: string | null;
}

export interface PlaylistItem extends MediaSummary {
  playlistItemId: string;
}

export interface CollectionSummary {
  collectionId: string;
  title: string;
  itemCount: number;
  thumbUrl: string | null;
}

export interface Preferences {
  autoSkipIntro: boolean;
  autoPlayNextEpisode: boolean;
  showContinueWatching: boolean;
  showRecentlyAdded: boolean;
  showTrending: boolean;
  showCollections: boolean;
  discoveryDisabled: boolean;
}

export type RequestStatus =
  | "unknown"
  | "pending"
  | "processing"
  | "partially_available"
  | "available"
  | "blocklisted";

export interface RequestAvailability {
  status: RequestStatus;
  status4k: RequestStatus;
  requests: Array<{ id: number; status: "pending" | "approved" | "declined" | "unknown"; is4k: boolean; mine: boolean }>;
  seasons: Array<{ number: number; status: RequestStatus; status4k: RequestStatus }>;
}

export interface CreateRequestBody {
  type: "movie" | "tv";
  tmdbId: number;
}

export interface CreateIssueBody {
  type: "movie" | "tv";
  tmdbId: number;
  issueType: 1 | 2 | 3 | 4;
  message: string;
}

export type VideoCodec = "h264" | "hevc" | "vp9" | "av1" | "mpeg2video" | "mpeg4" | "vc1";
export type AudioCodec =
  | "aac"
  | "ac3"
  | "eac3"
  | "truehd"
  | "dts"
  | "dts-hd"
  | "flac"
  | "opus"
  | "mp3"
  | "vorbis"
  | "pcm"
  | "alac";
export type Container = "mp4" | "mkv" | "mov" | "webm" | "mpegts" | "avi";
export type SubtitleCodec = "srt" | "vtt" | "ass" | "ssa" | "pgs" | "vobsub" | "mov_text" | "dvb";

export interface DeviceCapabilities {
  schemaVersion: 1;
  device: { manufacturer: string; model: string; sdkInt: number };
  display: { widthPx: number; heightPx: number; refreshRatesHz: number[]; hdrTypes: HdrType[] };
  video: Array<{
    codec: VideoCodec;
    profiles: string[];
    maxWidth: number;
    maxHeight: number;
    maxFrameRate: number | null;
    maxBitrateKbps: number | null;
    tenBit: boolean;
    hdrTypes: HdrType[];
  }>;
  audio: Array<{ codec: AudioCodec; maxChannels: number; passthrough: boolean }>;
  containers: Container[];
  subtitles: SubtitleCodec[];
  audioOutput: { type: "hdmi" | "speaker" | "bluetooth" | "usb" | "other"; maxChannels: number };
  maxVideoBitrateKbps: number | null;
}

export type PlaybackReason =
  | "start"
  | "quality_change"
  | "track_change"
  | "seek_reload"
  | "decoder_fallback"
  | "part_change"
  | "retry";

export interface PlaybackRequest {
  ratingKey: string;
  mediaId: string | null;
  /** Absolute full-item position. null resumes from the effective user's saved offset; 0 starts over. */
  startPositionMs: number | null;
  audioStreamId: string | null;
  subtitleStreamId: string | null;
  subtitlesOff: boolean;
  quality: string;
  forceTranscode: boolean;
  capabilities: DeviceCapabilities;
  replacesPlaybackId: string | null;
  reason: PlaybackReason;
}

export type PlaybackMethod = "direct_play" | "direct_stream" | "transcode";

export interface QualityOption {
  id: string;
  label: string;
  maxBitrateKbps: number | null;
  resolution: string | null;
}

export interface PlaybackPart {
  partId: string;
  index: number;
  /** Absolute full-item offset where this part starts. */
  startMs: number;
  durationMs: number;
  /** Same-origin relative URL; null for HLS parts that need a part_change playback request. */
  url: string | null;
}

export interface PlaybackDescriptor {
  playbackId: string;
  expiresInMs: number;
  media: { serverMachineId: string; ratingKey: string; mediaId: string; partId: string };
  item: MediaSummary;
  durationMs: number;
  startPositionMs: number;
  resumeSource: "request" | "saved" | "start";
  delivery: {
    type: "file" | "hls";
    method: PlaybackMethod;
    /** Plex decision codes when Plex was consulted; null for Watchtower-decided direct files. */
    plexDecision: { video: "copy" | "transcode" | null; audio: "copy" | "transcode" | null; subtitle: "copy" | "transcode" | "burn" | null } | null;
    mimeType: string;
    parts: PlaybackPart[];
    activePartIndex: number;
    timeline: {
      /** absolute: player position 0 == parts[activePartIndex].startMs; offset_relative: == requestedOffsetMs; unknown: client must measure. */
      mapping: "absolute" | "offset_relative" | "unknown";
      requestedOffsetMs: number;
    };
  };
  source: { videoCodec: string | null; width: number | null; height: number | null; hdr: HdrType | null; bitrateKbps: number | null; audioCodec: string | null; audioChannels: number | null; container: string | null };
  quality: { requested: string; options: QualityOption[]; transcodeTarget: { maxBitrateKbps: number | null; resolution: string | null } | null };
  tracks: {
    audio: AudioTrack[];
    subtitles: SubtitleTrack[];
    selectedAudioStreamId: string | null;
    selectedSubtitleStreamId: string | null;
    subtitleDelivery: "none" | "embedded" | "sidecar" | "burned";
    sidecarUrl: string | null;
  };
  markers: Marker[];
  nextItem: MediaSummary | null;
  previousItem: MediaSummary | null;
  autoplay: { autoSkipIntro: boolean; autoPlayNextEpisode: boolean };
  heartbeatIntervalMs: number;
  timelineIntervalMs: number;
  diagnostics: string[];
}

export interface TimelineRequest {
  state: "playing" | "paused" | "stopped";
  positionMs: number;
  durationMs: number;
  sequence: number;
}

export interface TimelineResponse {
  accepted: boolean;
}

export interface StopPlaybackRequest {
  positionMs: number | null;
  durationMs: number | null;
  sequence: number | null;
}
