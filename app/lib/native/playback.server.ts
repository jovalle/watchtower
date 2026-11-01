import { randomUUID } from "node:crypto";
import { buildPlexTranscodeUrl } from "~/lib/plex/client.server";
import { registerNativePlaybackSession, ownedNativePlaybackSession, replaceNativePlaybackSession } from "~/lib/plex/playback-session.server";
import { QUALITY_PROFILES, type PlexMetadata, type PlexStream } from "~/lib/plex/types";
import { DEFAULT_PREFERENCES, getUserSettings } from "~/lib/settings/storage.server";
import type { DeviceCapabilities, MediaSummary, PlaybackDescriptor, PlaybackRequest } from "./contract";
import { audioTrack, mediaSummary, nativePlexClient, plexData, subtitleTrack } from "./catalog.server";
import { NativeError } from "./http.server";
import { transcodeCommand } from "./playback-resources.server";
import type { NativePrincipal } from "./principal.server";
import { recheckPrincipal } from "./principal.server";

type Media = NonNullable<PlexMetadata["Media"]>[number] & { videoProfile?: string; bitDepth?: number; videoFrameRate?: string; colorTrc?: string };
type Stream = PlexStream & { visualImpaired?: boolean; hearingImpaired?: boolean; forced?: boolean; title?: string; colorTrc?: string; DOVIBLCompatID?: number; decision?: string };

function boundedString(value: unknown, nullable = false): value is string | null {
  return (nullable && value === null) || (typeof value === "string" && value.length > 0 && value.length <= 64);
}

export function parsePlaybackRequest(body: Record<string, unknown>): PlaybackRequest {
  const caps = body.capabilities as DeviceCapabilities | undefined;
  if (!boundedString(body.ratingKey) || !boundedString(body.mediaId, true) ||
      !boundedString(body.audioStreamId, true) || !boundedString(body.subtitleStreamId, true) ||
      typeof body.subtitlesOff !== "boolean" || !boundedString(body.quality) ||
      typeof body.forceTranscode !== "boolean" || !boundedString(body.replacesPlaybackId, true) ||
      !["start", "quality_change", "track_change", "seek_reload", "decoder_fallback", "part_change", "retry"].includes(String(body.reason)) ||
      (body.startPositionMs !== null && (!Number.isSafeInteger(body.startPositionMs) || Number(body.startPositionMs) < 0)) ||
      !caps || caps.schemaVersion !== 1 || !Array.isArray(caps.video) || caps.video.length > 32 || !Array.isArray(caps.audio) || caps.audio.length > 32 ||
      !Array.isArray(caps.containers) || caps.containers.length > 32 || !Array.isArray(caps.subtitles) || caps.subtitles.length > 32) {
    throw new NativeError(400, "invalid_request", "Invalid playback request.");
  }
  return body as unknown as PlaybackRequest;
}

function hdr(media: Media): PlaybackDescriptor["source"]["hdr"] {
  const video = media.Part?.[0]?.Stream?.find((stream) => stream.streamType === 1) as Stream | undefined;
  if (video?.DOVIProfile !== undefined) return "dolby-vision";
  if ((media.colorTrc ?? video?.colorTrc) === "smpte2084") return "hdr10";
  if ((media.colorTrc ?? video?.colorTrc) === "arib-std-b67") return "hlg";
  return null;
}

function normalizeVideoCodec(codec: string | undefined): string | null {
  return codec?.trim().toLowerCase() || null;
}

function normalizeAudioCodec(codec: string | undefined): string | null {
  const normalized = codec?.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return null;
  if (["dca", "dts"].includes(normalized)) return "dts";
  if (["dca-ma", "dts-ma", "dtshd-ma", "dts-hd-ma"].includes(normalized)) return "dts-hd";
  if (["e-ac-3", "e-ac3", "eac-3", "eac3"].includes(normalized)) return "eac3";
  if (["true-hd", "truehd"].includes(normalized)) return "truehd";
  if (["ac-3", "ac3"].includes(normalized)) return "ac3";
  if (normalized.startsWith("pcm")) return "pcm";
  return normalized;
}

function normalizeSubtitleCodec(codec: string | undefined): string | null {
  const normalized = codec?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "subrip") return "srt";
  if (normalized === "webvtt") return "vtt";
  if (normalized === "hdmv_pgs_subtitle") return "pgs";
  if (normalized === "dvd_subtitle") return "vobsub";
  return normalized;
}

function normalizeContainer(container: string | undefined): string | null {
  const normalized = container?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "m4v") return "mp4";
  if (normalized === "ts") return "mpegts";
  return normalized;
}

function usableHdr(media: Media): PlaybackDescriptor["source"]["hdr"] {
  const sourceHdr = hdr(media);
  if (sourceHdr !== "dolby-vision") return sourceHdr;
  const video = media.Part?.[0]?.Stream?.find((stream) => stream.streamType === 1) as Stream | undefined;
  if (video?.DOVIProfile === 8 && video.DOVIBLCompatID === 1) return "hdr10";
  if (video?.DOVIProfile === 8 && video.DOVIBLCompatID === 4) return "hlg";
  return "dolby-vision";
}

function videoFits(media: Media, caps: DeviceCapabilities): boolean {
  const videoCodec = normalizeVideoCodec(media.videoCodec);
  const capability = caps.video.find((entry) => entry.codec === videoCodec);
  const mediaHdr = usableHdr(media);
  if (!capability || (media.width ?? 0) > capability.maxWidth || (media.height ?? 0) > capability.maxHeight) return false;
  if (
    media.videoProfile &&
    capability.profiles.length &&
    !capability.profiles.some(
      (profile) => profile.toLowerCase() === media.videoProfile!.toLowerCase(),
    )
  ) return false;
  if ((media.bitDepth ?? 8) > 8 && !capability.tenBit) return false;
  if (mediaHdr && !capability.hdrTypes.includes(mediaHdr)) return false;
  const frameRate = Number.parseFloat(media.videoFrameRate ?? "");
  if (Number.isFinite(frameRate) && capability.maxFrameRate && frameRate > capability.maxFrameRate) return false;
  if (media.bitrate && capability.maxBitrateKbps && media.bitrate > capability.maxBitrateKbps) return false;
  return !caps.maxVideoBitrateKbps || !media.bitrate || media.bitrate <= caps.maxVideoBitrateKbps;
}

function clientProfileExtra(caps: DeviceCapabilities): string {
  // UNVERIFIED: PMS profile-extra syntax and limits require confirmation against a live server.
  const videoCodecs = [...new Set(caps.video.map((video) => video.codec))].join(",");
  const audioCodecs = [...new Set(caps.audio.map((audio) => audio.codec))].join(",");
  const entries = [
    `add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=${videoCodecs}&audioCodec=${audioCodecs})`,
  ];
  for (const video of caps.video) {
    entries.push(
      `add-limitation(scope=videoCodec&scopeName=${video.codec}&type=upperBound&name=video.width&value=${video.maxWidth})`,
      `add-limitation(scope=videoCodec&scopeName=${video.codec}&type=upperBound&name=video.height&value=${video.maxHeight})`,
      `add-limitation(scope=videoCodec&scopeName=${video.codec}&type=upperBound&name=video.bitDepth&value=${video.tenBit ? 10 : 8})`,
    );
  }
  return entries.join("+");
}

function directFileMimeType(container: string | null): string {
  return {
    mkv: "video/x-matroska",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mpegts: "video/mp2t",
    avi: "video/x-msvideo",
  }[container ?? ""] ?? "application/octet-stream";
}

async function adjacentItems(
  client: ReturnType<typeof nativePlexClient>,
  metadata: PlexMetadata,
): Promise<{ previous: MediaSummary | null; next: MediaSummary | null }> {
  if (metadata.type !== "episode" || !metadata.grandparentRatingKey) {
    return { previous: null, next: null };
  }
  try {
    const leaves = plexData(await client.getAllLeaves(metadata.grandparentRatingKey));
    const index = leaves.findIndex((item) => item.ratingKey === metadata.ratingKey);
    return {
      previous: index > 0 ? mediaSummary(leaves[index - 1]) : null,
      next:
        index >= 0 && index + 1 < leaves.length
          ? mediaSummary(leaves[index + 1])
          : null,
    };
  } catch {
    return { previous: null, next: null };
  }
}

export async function negotiatePlayback(
  principal: NativePrincipal,
  deviceName: string,
  request: PlaybackRequest,
): Promise<PlaybackDescriptor> {
  const client = nativePlexClient(principal);
  const metadata = plexData(await client.getMetadata(request.ratingKey, { includeMarkers: true }), true);
  const mediaItems = (metadata.Media ?? []) as Media[];
  const selected = request.mediaId
    ? mediaItems.find((media) => String(media.id) === request.mediaId)
    : mediaItems.find((media) => videoFits(media, request.capabilities)) ?? mediaItems[0];
  if (request.mediaId && !selected) {
    throw new NativeError(404, "not_found", "Media version not found.");
  }
  if (!selected) throw new NativeError(422, "unsupported_media", "No playable media version is available.");
  const parts = selected.Part ?? [];
  if (!parts.length || parts.some((part) => !Number.isSafeInteger(part.duration) || (part.duration ?? 0) <= 0)) {
    throw new NativeError(422, "unsupported_media", "All media parts must have a duration.");
  }
  const totalDuration = parts.reduce((sum, part) => sum + part.duration!, 0);
  const requestedStart = request.startPositionMs ?? metadata.viewOffset ?? 0;
  const startPositionMs = Math.min(requestedStart, totalDuration);
  let elapsed = 0;
  let activePartIndex = parts.length - 1;
  const descriptorParts = parts.map((part, index) => {
    const startMs = elapsed;
    elapsed += part.duration!;
    if (startPositionMs >= startMs && startPositionMs < elapsed) activePartIndex = index;
    return { partId: String(part.id), index, startMs, durationMs: part.duration!, url: null as string | null };
  });
  const selectedPart = parts[activePartIndex];
  const streams = (selectedPart.Stream ?? []) as Stream[];
  const audio = streams.filter((stream) => stream.streamType === 2);
  const subtitles = streams.filter((stream) => stream.streamType === 3);
  const selectedAudio = request.audioStreamId ? audio.find((stream) => String(stream.id) === request.audioStreamId) : audio.find((stream) => stream.selected) ?? audio[0];
  const selectedSubtitle = request.subtitlesOff ? undefined : request.subtitleStreamId ? subtitles.find((stream) => String(stream.id) === request.subtitleStreamId) : subtitles.find((stream) => stream.selected);
  if (request.audioStreamId && !selectedAudio) throw new NativeError(404, "not_found", "Audio stream not found.");
  if (request.subtitleStreamId && !selectedSubtitle) throw new NativeError(404, "not_found", "Subtitle stream not found.");
  const sourceHdr = hdr(selected);
  const videoSupported = videoFits(selected, request.capabilities);
  const audioCodec = normalizeAudioCodec(selectedAudio?.codec ?? selected.audioCodec);
  const audioSupported = !audioCodec || request.capabilities.audio.some((entry) => entry.codec === audioCodec && entry.maxChannels >= (selectedAudio?.channels ?? selected.audioChannels ?? 1));
  const subtitleCodec = normalizeSubtitleCodec(selectedSubtitle?.codec);
  const externalTextSubtitle = Boolean(selectedSubtitle?.key) && ["srt", "vtt"].includes(subtitleCodec ?? "");
  const embeddedSubtitleSupported = Boolean(selectedSubtitle) && !selectedSubtitle?.key && request.capabilities.subtitles.includes(subtitleCodec as DeviceCapabilities["subtitles"][number]);
  const fileSubtitleDelivery = !selectedSubtitle
    ? "none"
    : externalTextSubtitle
      ? "sidecar"
      : embeddedSubtitleSupported
        ? "embedded"
        : "burned";
  const original = request.quality === "original";
  const container = normalizeContainer(selected.container ?? selectedPart.container);
  const directFile = original && !request.forceTranscode && videoSupported && audioSupported && fileSubtitleDelivery !== "burned" && request.capabilities.containers.includes(container as DeviceCapabilities["containers"][number]);
  const hlsSubtitleDelivery = !selectedSubtitle ? "none" : externalTextSubtitle ? "sidecar" : "burned";
  const subtitleDelivery = directFile ? fileSubtitleDelivery : hlsSubtitleDelivery;
  const method = directFile ? "direct_play" : videoSupported && original && !request.forceTranscode && subtitleDelivery !== "burned" ? "direct_stream" : "transcode";
  const playbackId = randomUUID();
  const clientId = `${process.env.PLEX_CLIENT_ID ?? "watchtower-001"}-${playbackId}`;
  const profile = QUALITY_PROFILES.find((quality) => quality.id === request.quality);
  if (!profile) throw new NativeError(400, "invalid_request", "Unknown quality profile.");
  let hlsQuery: string | null = null;
  let plexDecision: PlaybackDescriptor["delivery"]["plexDecision"] = null;
  if (directFile) {
    for (const part of descriptorParts) part.url = `/api/v1/playback/${playbackId}/file/${part.partId}`;
  } else {
    const currentAudio = audio.find((stream) => stream.selected);
    const currentSubtitle = subtitles.find((stream) => stream.selected);
    const selection: { audioStreamID?: number; subtitleStreamID?: number } = {};
    if (selectedAudio && selectedAudio.id !== currentAudio?.id) {
      selection.audioStreamID = selectedAudio.id;
    }
    if ((selectedSubtitle?.id ?? 0) !== (currentSubtitle?.id ?? 0)) {
      selection.subtitleStreamID = selectedSubtitle?.id ?? 0;
    }
    if (Object.keys(selection).length > 0) {
      await recheckPrincipal(principal);
      plexData(await client.setStreamSelection(selectedPart.id, selection));
    }
    const offsetSeconds = Math.floor((startPositionMs - descriptorParts[activePartIndex].startMs) / 1000);
    const streamUrl = buildPlexTranscodeUrl({
      serverUrl: principal.serverUrl,
      token: principal.serverToken,
      ratingKey: request.ratingKey,
      session: playbackId,
      clientIdentifier: clientId,
      mediaIndex: mediaItems.indexOf(selected),
      partIndex: activePartIndex,
      offsetSeconds,
      quality: profile,
      forceTranscode: method === "transcode",
      subtitles: subtitleDelivery === "burned" ? "burn" : "none",
      clientProfileExtra: clientProfileExtra(request.capabilities),
      platform: "Android",
      device: "Android TV",
      deviceName,
    });
    const decision = plexData(await client.getTranscodeDecision(streamUrl));
    if (decision.generalDecisionCode >= 2000) throw new NativeError(422, "unsupported_media", "Plex cannot play this media with the requested settings.");
    const normalize = (value: string | undefined) => value === "copy" || value === "transcode" || value === "burn" ? value : null;
    plexDecision = { video: normalize(decision.videoDecision) as "copy" | "transcode" | null, audio: normalize(decision.audioDecision) as "copy" | "transcode" | null, subtitle: normalize(decision.subtitleDecision) as "copy" | "transcode" | "burn" | null };
    hlsQuery = new URL(streamUrl).search;
    descriptorParts[activePartIndex].url = `/api/v1/playback/${playbackId}/hls/start.m3u8`;
  }
  registerNativePlaybackSession(playbackId, principal, {
    ratingKey: request.ratingKey,
    clientId,
    mediaId: String(selected.id),
    partIds: parts.map((part) => String(part.id)),
    partKeys: Object.fromEntries(parts.map((part) => [String(part.id), part.key])),
    allowedSubtitleStreams: Object.fromEntries(subtitles.filter((stream) => stream.key && ["srt", "vtt"].includes(normalizeSubtitleCodec(stream.codec) ?? "")).map((stream) => [String(stream.id), stream.key!])),
    delivery: directFile ? "file" : "hls",
    hlsQuery,
  });
  if (request.replacesPlaybackId) {
    const replaced = ownedNativePlaybackSession(request.replacesPlaybackId, principal);
    if (replaced) {
      await transcodeCommand(principal, replaced, "stop");
      replaceNativePlaybackSession(request.replacesPlaybackId);
    }
  }
  const subtitleSidecar = subtitleDelivery === "sidecar" ? `/api/v1/playback/${playbackId}/subtitles/${selectedSubtitle!.id}` : null;
  const [adjacent, settings] = await Promise.all([
    adjacentItems(client, metadata),
    getUserSettings(Number(principal.userId)),
  ]);
  const preferences = { ...DEFAULT_PREFERENCES, ...settings?.preferences };
  return {
    playbackId,
    expiresInMs: 6 * 60 * 60 * 1000,
    media: { serverMachineId: principal.serverMachineId, ratingKey: request.ratingKey, mediaId: String(selected.id), partId: String(selectedPart.id) },
    item: mediaSummary(metadata),
    durationMs: totalDuration,
    startPositionMs,
    resumeSource: request.startPositionMs === null ? metadata.viewOffset ? "saved" : "start" : "request",
    delivery: { type: directFile ? "file" : "hls", method, plexDecision, mimeType: directFile ? directFileMimeType(container) : "application/x-mpegURL", parts: descriptorParts, activePartIndex, timeline: { mapping: directFile ? "absolute" : "unknown", requestedOffsetMs: directFile ? startPositionMs : descriptorParts[activePartIndex].startMs + Math.floor((startPositionMs - descriptorParts[activePartIndex].startMs) / 1000) * 1000 } },
    source: { videoCodec: normalizeVideoCodec(selected.videoCodec), width: selected.width ?? null, height: selected.height ?? null, hdr: sourceHdr, bitrateKbps: selected.bitrate ?? null, audioCodec, audioChannels: selected.audioChannels ?? null, container },
    quality: { requested: request.quality, options: QUALITY_PROFILES.map((quality) => ({ id: quality.id, label: quality.label, maxBitrateKbps: quality.maxBitrate ?? null, resolution: quality.resolution ?? null })), transcodeTarget: method === "transcode" ? { maxBitrateKbps: profile.maxBitrate ?? null, resolution: profile.resolution ?? null } : null },
    tracks: { audio: audio.map(audioTrack), subtitles: subtitles.map(subtitleTrack), selectedAudioStreamId: selectedAudio ? String(selectedAudio.id) : null, selectedSubtitleStreamId: selectedSubtitle ? String(selectedSubtitle.id) : null, subtitleDelivery, sidecarUrl: subtitleSidecar },
    markers: (metadata.Marker ?? []).filter((marker) => marker.type === "intro" || marker.type === "credits").map((marker) => ({ type: marker.type as "intro" | "credits", startMs: marker.startTimeOffset, endMs: marker.endTimeOffset, final: Boolean(marker.final) })),
    nextItem: adjacent.next,
    previousItem: adjacent.previous,
    autoplay: { autoSkipIntro: preferences.autoSkipIntro, autoPlayNextEpisode: preferences.autoPlayNextEpisode },
    heartbeatIntervalMs: 30_000,
    timelineIntervalMs: 10_000,
    diagnostics: [subtitleDelivery === "burned" ? "Selected subtitle is burned into HLS." : directFile ? "Direct file matches declared capabilities." : method === "direct_stream" ? "Video copied through HLS; another stream requires conversion." : "Video transcoded for declared capabilities or quality."],
  };
}