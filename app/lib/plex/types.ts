/**
 * Plex API type definitions.
 */

/**
 * Plex server identity information returned from the root endpoint.
 */
export interface PlexServerIdentity {
  machineIdentifier: string;
  friendlyName: string;
  version: string;
  platform: string;
  platformVersion: string;
  myPlex: boolean;
  myPlexUsername?: string;
  myPlexSigninState?: string;
}

/**
 * Generic Plex API media container wrapper.
 */
export interface PlexMediaContainer<T = unknown> {
  MediaContainer: T;
}

/**
 * Server identity response from Plex API root endpoint.
 */
export interface PlexIdentityResponse {
  MediaContainer: PlexServerIdentity;
}

/**
 * Plex API error structure.
 */
export interface PlexError {
  code: number;
  message: string;
  status?: number;
}

/**
 * Result type for Plex API operations.
 */
export type PlexResult<T> =
  | { success: true; data: T }
  | { success: false; error: PlexError };

/**
 * Plex server connection configuration.
 */
export interface PlexServerConfig {
  serverUrl: string;
  token: string;
  clientId: string;
}

// ============================================================================
// Library Types
// ============================================================================

/**
 * Plex library section (Movies, TV Shows, Music, etc.)
 */
export interface PlexLibrarySection {
  key: string;
  type: "movie" | "show" | "artist" | "photo";
  title: string;
  uuid: string;
  scanner?: string;
  agent?: string;
  language?: string;
  updatedAt?: number;
  createdAt?: number;
  scannedAt?: number;
  contentChangedAt?: number;
  hidden?: number;
  Location?: Array<{ id: number; path: string }>;
}

/**
 * Individual media item in a library (movie, show, episode, etc.)
 */
export interface PlexMediaItem {
  ratingKey: string;
  key: string;
  guid: string;
  type: "movie" | "show" | "season" | "episode" | "artist" | "album" | "track";
  title: string;
  originalTitle?: string;
  year?: number;
  duration?: number;
  addedAt?: number;
  updatedAt?: number;
  thumb?: string;
  art?: string;
  summary?: string;
  contentRating?: string;
  audienceRating?: number;
  rating?: number;
  userRating?: number; // User's personal rating (0-10 scale)
  viewCount?: number;
  lastViewedAt?: number;
  viewOffset?: number;
  originallyAvailableAt?: string;
  // Extended metadata (returned in list views)
  Genre?: PlexTag[];
  Director?: PlexTag[];
  Role?: PlexRole[];
  // For TV shows
  parentRatingKey?: string;
  parentTitle?: string;
  grandparentRatingKey?: string;
  grandparentTitle?: string;
  grandparentThumb?: string;
  grandparentArt?: string;
  index?: number;
  parentIndex?: number;
  leafCount?: number;
  viewedLeafCount?: number;
  childCount?: number;
  // For playlist items
  playlistItemID?: number;
}

/**
 * Tag reference used for genres, directors, writers, etc.
 */
export interface PlexTag {
  id?: number;
  tag: string;
}

/**
 * Role/actor reference with optional character info.
 */
export interface PlexRole {
  id?: number;
  tag: string;
  role?: string;
  thumb?: string;
}

/**
 * Full media metadata with related items (extends PlexMediaItem).
 */
export interface PlexMetadata extends PlexMediaItem {
  studio?: string;
  originallyAvailableAt?: string;
  tagline?: string;
  Genre?: PlexTag[];
  Director?: PlexTag[];
  Writer?: PlexTag[];
  Role?: PlexRole[];
  Similar?: Array<{ id?: number; tag: string; ratingKey?: string }>;
  // Media/stream info
  Media?: Array<{
    id: number;
    duration?: number;
    bitrate?: number;
    width?: number;
    height?: number;
    aspectRatio?: number;
    audioChannels?: number;
    audioCodec?: string;
    videoCodec?: string;
    videoResolution?: string;
    container?: string;
    Part?: Array<{
      id: number;
      key: string;
      duration?: number;
      file?: string;
      size?: number;
      container?: string;
      Stream?: PlexStream[];
    }>;
  }>;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response wrapper for library sections endpoint.
 */
export interface PlexLibrarySectionsResponse {
  MediaContainer: {
    size: number;
    allowSync: boolean;
    title1: string;
    Directory: PlexLibrarySection[];
  };
}

/**
 * Response wrapper for library items endpoint.
 */
export interface PlexLibraryItemsResponse {
  MediaContainer: {
    size: number;
    totalSize?: number;
    offset?: number;
    allowSync: boolean;
    art?: string;
    identifier?: string;
    librarySectionID?: number;
    librarySectionTitle?: string;
    librarySectionUUID?: string;
    mediaTagPrefix?: string;
    mediaTagVersion?: number;
    thumb?: string;
    title1?: string;
    title2?: string;
    viewGroup?: string;
    viewMode?: number;
    Metadata: PlexMediaItem[];
  };
}

/**
 * Response wrapper for single metadata item endpoint.
 */
export interface PlexMetadataResponse {
  MediaContainer: {
    size: number;
    allowSync: boolean;
    identifier?: string;
    librarySectionID?: number;
    librarySectionTitle?: string;
    librarySectionUUID?: string;
    mediaTagPrefix?: string;
    mediaTagVersion?: number;
    Metadata: PlexMetadata[];
  };
}

/**
 * Query options for fetching library items.
 */
export interface LibraryQueryOptions {
  sort?: string;
  genre?: string;
  year?: number;
  limit?: number;
  offset?: number;
  /** Raw filter string for Plex API (e.g., "unwatched=1", "inProgress=1") */
  filter?: string;
}

// ============================================================================
// Streaming Types
// ============================================================================

/**
 * Quality profile for video streaming.
 */
export interface QualityProfile {
  id: string;
  label: string;
  maxBitrate?: number; // In kbps, undefined = original quality
  resolution?: string; // e.g., "1080p", "720p", "480p"
  isOriginal?: boolean;
}

/**
 * Available quality profiles.
 */
export const QUALITY_PROFILES: QualityProfile[] = [
  { id: "original", label: "Original", isOriginal: true },
  { id: "1080p-20", label: "1080p (20 Mbps)", maxBitrate: 20000, resolution: "1080p" },
  { id: "1080p-12", label: "1080p (12 Mbps)", maxBitrate: 12000, resolution: "1080p" },
  { id: "1080p-8", label: "1080p (8 Mbps)", maxBitrate: 8000, resolution: "1080p" },
  { id: "720p-4", label: "720p (4 Mbps)", maxBitrate: 4000, resolution: "720p" },
  { id: "720p-2", label: "720p (2 Mbps)", maxBitrate: 2000, resolution: "720p" },
  { id: "480p-1.5", label: "480p (1.5 Mbps)", maxBitrate: 1500, resolution: "480p" },
];

/**
 * Playback method indicating how content is being delivered.
 */
export type PlaybackMethod = "direct_play" | "direct_stream" | "transcode";

/**
 * Playback information for video streaming.
 */
export interface PlexPlaybackInfo {
  /** Complete HLS stream URL with authentication */
  streamUrl: string;
  /** Protocol used (always 'hls' for this implementation) */
  protocol: "hls";
  /** Whether direct play is enabled */
  directPlay: boolean;
  /** Whether direct stream is enabled */
  directStream: boolean;
  /** Quality profile being used */
  quality: QualityProfile;
  /** Available quality profiles for this media */
  availableQualities: QualityProfile[];
  /** Current playback method */
  method: PlaybackMethod;
}

/**
 * Stream codec information within a media part.
 */
export interface PlexStream {
  id: number;
  streamType: number; // 1=video, 2=audio, 3=subtitle
  codec?: string;
  language?: string;
  languageCode?: string;
  displayTitle?: string;
  selected?: boolean;
  default?: boolean;
  bitrate?: number;
  // Video-specific
  width?: number;
  height?: number;
  frameRate?: string;
  // Audio-specific
  channels?: number;
  samplingRate?: number;
}

// ============================================================================
// Session/Activity Types
// ============================================================================

/**
 * Session information for active playback.
 */
export interface PlexSession {
  id: string;
  bandwidth?: number;
  location?: "lan" | "wan";
}

/**
 * Player device information for active sessions.
 */
export interface PlexPlayer {
  address?: string;
  device?: string;
  machineIdentifier: string;
  model?: string;
  platform?: string;
  platformVersion?: string;
  product?: string;
  profile?: string;
  state: "playing" | "paused" | "buffering";
  title?: string;
  local?: boolean;
  relayed?: boolean;
  secure?: boolean;
  userID?: number;
}

/**
 * Transcode session details for active playback.
 */
export interface PlexTranscodeSession {
  key: string;
  throttled?: boolean;
  complete?: boolean;
  progress?: number;
  speed?: number;
  size?: number;
  videoDecision?: "transcode" | "copy" | "directplay";
  audioDecision?: "transcode" | "copy" | "directplay";
  subtitleDecision?: "transcode" | "copy" | "burn";
  protocol?: string;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  width?: number;
  height?: number;
  transcodeHwRequested?: boolean;
  transcodeHwFullPipeline?: boolean;
}

/**
 * User information for active sessions.
 */
export interface PlexSessionUser {
  id: string;
  title: string;
  thumb?: string;
}

/**
 * Active playback session combining media, player, session, and user info.
 * Extends PlexMediaItem with session-specific properties.
 */
export interface PlexActiveSession extends PlexMediaItem {
  Session?: PlexSession;
  Player?: PlexPlayer;
  User?: PlexSessionUser;
  TranscodeSession?: PlexTranscodeSession;
  /** Session ID for this playback */
  sessionKey?: string;
}

/**
 * Response wrapper for /status/sessions endpoint.
 */
export interface PlexSessionsResponse {
  MediaContainer: {
    size: number;
    Metadata?: PlexActiveSession[];
  };
}

// ============================================================================
// Watchlist Types (from discover.provider.plex.tv)
// ============================================================================

/**
 * Watchlist item from Plex's discover API.
 * These items come from Plex's cloud metadata, not local server.
 */
export interface PlexWatchlistItem {
  ratingKey: string;
  key: string;
  guid: string;
  type: "movie" | "show";
  title: string;
  year?: number;
  thumb?: string;
  art?: string;
  summary?: string;
  contentRating?: string;
  audienceRating?: number;
  watchlistedAt?: number;
  originallyAvailableAt?: string;
  Genre?: PlexTag[];
  Role?: PlexRole[];
  // Availability info
  streamingMediaId?: string;
  slug?: string;
}

/**
 * Response wrapper for watchlist endpoint.
 */
export interface PlexWatchlistResponse {
  MediaContainer: {
    size: number;
    totalSize?: number;
    offset?: number;
    identifier?: string;
    Metadata?: PlexWatchlistItem[];
  };
}

// ============================================================================
// Playlist/Collection Types
// ============================================================================

/**
 * Plex playlist item.
 */
export interface PlexPlaylist {
  ratingKey: string;
  key: string;
  guid: string;
  type: "playlist";
  title: string;
  summary?: string;
  smart: boolean;
  playlistType: "video" | "audio" | "photo";
  composite?: string; // Thumbnail composite image
  viewCount?: number;
  lastViewedAt?: number;
  duration?: number;
  leafCount: number;
  addedAt?: number;
  updatedAt?: number;
}

/**
 * Plex collection item.
 */
export interface PlexCollection {
  ratingKey: string;
  key: string;
  guid: string;
  type: "collection";
  title: string;
  subtype: "movie" | "show";
  summary?: string;
  thumb?: string;
  art?: string;
  childCount: number;
  addedAt?: number;
  updatedAt?: number;
  minYear?: number;
  maxYear?: number;
}

/**
 * Response wrapper for playlists endpoint.
 */
export interface PlexPlaylistsResponse {
  MediaContainer: {
    size: number;
    Metadata?: PlexPlaylist[];
  };
}

/**
 * Response wrapper for collections endpoint.
 */
export interface PlexCollectionsResponse {
  MediaContainer: {
    size: number;
    Metadata?: PlexCollection[];
  };
}

// ============================================================================
// Session History Types
// ============================================================================

/**
 * History item from the session history endpoint.
 * Represents a completed watch session.
 */
export interface PlexHistoryItem {
  historyKey: string;
  ratingKey: string;
  title: string;
  type: "movie" | "episode";
  thumb?: string;
  parentTitle?: string;      // Show name for episodes
  grandparentTitle?: string; // Show name for episodes
  index?: number;            // Episode number
  parentIndex?: number;      // Season number
  viewedAt: number;          // Unix timestamp
  accountID: number;
  deviceID: number;
}

/**
 * Response wrapper for session history endpoint.
 */
export interface PlexHistoryResponse {
  MediaContainer: {
    size: number;
    Metadata?: PlexHistoryItem[];
  };
}
