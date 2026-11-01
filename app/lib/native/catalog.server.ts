import { createHash } from "node:crypto";
import { PlexClient } from "~/lib/plex/client.server";
import type { PlexMediaItem, PlexMetadata, PlexResult, PlexStream } from "~/lib/plex/types";
import type {
  AudioTrack,
  CollectionSummary,
  HdrType,
  MediaDetail,
  MediaSummary,
  MediaVersion,
  PlaylistItem,
  PlaylistSummary,
  SubtitleFormat,
  SubtitleTrack,
} from "./contract";
import { NativeError } from "./http.server";
import type { NativePrincipal } from "./principal.server";
import { markPrincipalForVerification } from "./principal.server";

type ExtendedStream = PlexStream & {
  visualImpaired?: boolean;
  hearingImpaired?: boolean;
  forced?: boolean;
  title?: string;
};

type PlexMedia = NonNullable<PlexMetadata["Media"]>[number];
type ExtendedMedia = PlexMedia & {
  videoProfile?: string;
  videoFrameRate?: string;
  bitDepth?: number;
  colorTrc?: string;
};

type ExtendedMetadata = Omit<PlexMetadata, "Media"> & {
  editionTitle?: string;
  Media?: ExtendedMedia[];
};

export function nativePlexClient(principal: NativePrincipal): PlexClient {
  return new PlexClient({
    serverUrl: principal.serverUrl,
    token: principal.serverToken,
    clientId: process.env.PLEX_CLIENT_ID ?? "watchtower-001",
    onUnauthorized: () => markPrincipalForVerification(principal),
  });
}

export async function requireNativePlexResponse(
  response: Response,
  principal: NativePrincipal,
): Promise<Response> {
  if (response.status === 401) {
    await markPrincipalForVerification(principal);
    throw new NativeError(
      401,
      "upstream_auth_failed",
      "Plex authorization failed.",
    );
  }
  return response;
}

export function plexData<T>(result: PlexResult<T>, notFound = false): T {
  if (result.success) return result.data;
  if (result.error.status === 401) {
    throw new NativeError(401, "upstream_auth_failed", "Plex authorization failed.");
  }
  if (notFound || result.error.status === 404) {
    throw new NativeError(404, "not_found", "Media not found.");
  }
  throw new NativeError(503, "upstream_unavailable", "Plex is unavailable.", true, 15);
}

export function imageUrl(
  source: string | undefined,
  width: number,
  height: number,
): string | null {
  if (!source) return null;
  return `/api/v1/images?src=${encodeURIComponent(source)}&w=${width}&h=${height}`;
}

export function mediaSummary(item: PlexMediaItem): MediaSummary {
  return {
    ratingKey: item.ratingKey ?? null,
    type: item.type as MediaSummary["type"],
    title: item.title,
    year: item.year ?? null,
    posterUrl: imageUrl(item.thumb ?? item.grandparentThumb, 400, 600),
    backdropUrl: imageUrl(item.art ?? item.grandparentArt, 1280, 720),
    thumbUrl: imageUrl(item.type === "episode" ? item.thumb : undefined, 640, 360),
    durationMs: item.duration ?? null,
    viewOffsetMs: item.viewOffset ?? null,
    viewCount: item.viewCount ?? 0,
    leafCount: item.leafCount ?? null,
    viewedLeafCount: item.viewedLeafCount ?? null,
    contentRating: item.contentRating ?? null,
    showTitle: item.grandparentTitle ?? null,
    seasonNumber: item.parentIndex ?? (item.type === "season" ? item.index ?? null : null),
    episodeNumber: item.type === "episode" ? item.index ?? null : null,
    parentRatingKey: item.parentRatingKey ?? null,
    grandparentRatingKey: item.grandparentRatingKey ?? null,
    external: null,
  };
}

function subtitleFormat(codec: string | undefined): SubtitleFormat {
  if (["srt", "vtt", "mov_text"].includes(codec ?? "")) return "text";
  if (["ass", "ssa"].includes(codec ?? "")) return "styled";
  if (["pgs", "vobsub", "dvb"].includes(codec ?? "")) return "image";
  return "unknown";
}

export function audioTrack(stream: ExtendedStream): AudioTrack {
  return {
    streamId: String(stream.id),
    title: stream.displayTitle ?? stream.title ?? stream.language ?? stream.codec ?? "Audio",
    language: stream.language ?? null,
    languageCode: stream.languageCode ?? null,
    codec: stream.codec ?? null,
    channels: stream.channels ?? null,
    default: Boolean(stream.default),
    selected: Boolean(stream.selected),
    audioDescription: Boolean(stream.visualImpaired),
  };
}

export function subtitleTrack(stream: ExtendedStream): SubtitleTrack {
  return {
    streamId: String(stream.id),
    title: stream.displayTitle ?? stream.title ?? stream.language ?? stream.codec ?? "Subtitle",
    language: stream.language ?? null,
    languageCode: stream.languageCode ?? null,
    codec: stream.codec ?? null,
    format: subtitleFormat(stream.codec),
    external: Boolean(stream.key),
    forced: Boolean(stream.forced),
    hearingImpaired: Boolean(stream.hearingImpaired),
    default: Boolean(stream.default),
    selected: Boolean(stream.selected),
  };
}

function hdrType(media: ExtendedMedia): HdrType | null {
  const video = media.Part?.flatMap((part) => part.Stream ?? []).find((stream) => stream.streamType === 1) as (ExtendedStream & { colorTrc?: string }) | undefined;
  if (video?.DOVIProfile !== undefined) return "dolby-vision";
  const colorTrc = media.colorTrc ?? video?.colorTrc;
  if (colorTrc === "smpte2084") return "hdr10";
  if (colorTrc === "arib-std-b67") return "hlg";
  return null;
}

export function mediaVersions(metadata: ExtendedMetadata): MediaVersion[] {
  return (metadata.Media ?? []).map((media) => {
    const streams = (media.Part?.[0]?.Stream ?? []) as ExtendedStream[];
    const hdr = hdrType(media);
    const resolution = media.height ? `${media.height >= 2160 ? "4K" : `${media.height}p`}` : media.videoResolution ?? null;
    const labels = [resolution, hdr?.toUpperCase(), media.videoCodec?.toUpperCase(), media.audioCodec ? `${media.audioCodec.toUpperCase()}${media.audioChannels ? ` ${media.audioChannels}` : ""}` : null].filter(Boolean);
    return {
      mediaId: String(media.id),
      label: labels.join(" · ") || `Version ${media.id}`,
      container: media.container ?? null,
      videoCodec: media.videoCodec ?? null,
      videoProfile: media.videoProfile ?? null,
      videoResolution: media.videoResolution ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
      frameRate: media.videoFrameRate ? Number.parseFloat(media.videoFrameRate) : null,
      bitDepth: media.bitDepth ?? null,
      hdr,
      bitrateKbps: media.bitrate ?? null,
      audioCodec: media.audioCodec ?? null,
      audioChannels: media.audioChannels ?? null,
      durationMs: media.duration ?? metadata.duration ?? null,
      parts: (media.Part ?? []).map((part, index) => ({
        partId: String(part.id),
        index,
        durationMs: part.duration ?? null,
        container: part.container ?? media.container ?? null,
        sizeBytes: part.size ?? null,
      })),
      audioTracks: streams.filter((stream) => stream.streamType === 2).map(audioTrack),
      subtitleTracks: streams.filter((stream) => stream.streamType === 3).map(subtitleTrack),
    };
  });
}

function guid(metadata: PlexMetadata, provider: string): string | null {
  return metadata.Guid?.find((entry) => entry.id.startsWith(`${provider}://`))?.id.split("//")[1] ?? null;
}

export function mediaDetail(metadata: PlexMetadata): MediaDetail {
  const extended = metadata as ExtendedMetadata;
  return {
    ...mediaSummary(metadata),
    summary: metadata.summary ?? null,
    tagline: metadata.tagline ?? null,
    studio: metadata.studio ?? null,
    genres: metadata.Genre?.map(({ tag }) => tag) ?? [],
    directors: metadata.Director?.map(({ tag }) => tag) ?? [],
    cast: metadata.Role?.map((role) => ({ name: role.tag, role: role.role ?? null, thumbUrl: imageUrl(role.thumb, 200, 300) })) ?? [],
    audienceRating: metadata.audienceRating ?? null,
    criticRating: metadata.rating ?? null,
    userRating: metadata.userRating ?? null,
    originallyAvailableAt: metadata.originallyAvailableAt ?? null,
    editionTitle: extended.editionTitle ?? null,
    editions: [],
    guids: { imdb: guid(metadata, "imdb"), tmdb: guid(metadata, "tmdb"), tvdb: guid(metadata, "tvdb"), plex: metadata.guid?.startsWith("plex://") ? metadata.guid : null },
    versions: mediaVersions(extended),
    markers: (metadata.Marker ?? []).filter((marker) => marker.type === "intro" || marker.type === "credits").map((marker) => ({ type: marker.type as "intro" | "credits", startMs: marker.startTimeOffset, endMs: marker.endTimeOffset, final: Boolean(marker.final) })),
    onWatchlist: null,
    playable: Boolean(metadata.Media?.some((media) => media.Part?.length)),
  };
}

export function playlistSummary(item: { ratingKey: string; title: string; leafCount: number; duration?: number; smart: boolean; composite?: string }): PlaylistSummary {
  return { playlistId: item.ratingKey, title: item.title, itemCount: item.leafCount, durationMs: item.duration ?? null, smart: item.smart, thumbUrl: imageUrl(item.composite, 400, 600) };
}

export function playlistItem(item: PlexMediaItem): PlaylistItem {
  return { ...mediaSummary(item), playlistItemId: String(item.playlistItemID ?? "") };
}

export function collectionSummary(item: { ratingKey: string; title: string; childCount: number; thumb?: string }): CollectionSummary {
  return { collectionId: item.ratingKey, title: item.title, itemCount: item.childCount, thumbUrl: imageUrl(item.thumb, 400, 600) };
}

export function encodeCursor(offset: number, normalizedQuery: string): string {
  const hash = createHash("sha256").update(normalizedQuery).digest("hex").slice(0, 16);
  return Buffer.from(JSON.stringify({ offset, hash })).toString("base64url");
}

export function decodeCursor(cursor: string | null, normalizedQuery: string): number {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const hash = createHash("sha256").update(normalizedQuery).digest("hex").slice(0, 16);
    if (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.hash !== hash) throw new Error();
    return value.offset;
  } catch {
    throw new NativeError(400, "invalid_cursor", "The pagination cursor is invalid for this query.");
  }
}

export function pageLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return 50;
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new NativeError(400, "invalid_request", "limit must be an integer from 1 to 100.");
  }
  return limit;
}