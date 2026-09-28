import { randomUUID } from "node:crypto";
import { buildPlexTranscodeUrl } from "~/lib/plex/client.server";
import { registerNativePlaybackSession, ownedNativePlaybackSession, replaceNativePlaybackSession } from "~/lib/plex/playback-session.server";
import { QUALITY_PROFILES, type PlexMetadata, type PlexStream } from "~/lib/plex/types";
import type { DeviceCapabilities, PlaybackDescriptor, PlaybackRequest, SubtitleCodec } from "./contract";
import { audioTrack, mediaSummary, nativePlexClient, plexData, subtitleTrack } from "./catalog.server";
import { NativeError } from "./http.server";
import type { NativePrincipal } from "./principal.server";
import { recheckPrincipal } from "./principal.server";

type Media = NonNullable<PlexMetadata["Media"]>[number] & { videoProfile?: string; bitDepth?: number; videoFrameRate?: string; colorTrc?: string };
type Stream = PlexStream & { visualImpaired?: boolean; hearingImpaired?: boolean; forced?: boolean; title?: string; colorTrc?: string };

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

function videoFits(media: Media, caps: DeviceCapabilities): boolean {
  const capability = caps.video.find((entry) => entry.codec === media.videoCodec);
  const mediaHdr = hdr(media);
  if (!capability || (media.width ?? 0) > capability.maxWidth || (media.height ?? 0) > capability.maxHeight) return false;
  if (media.videoProfile && capability.profiles.length && !capability.profiles.includes(media.videoProfile)) return false;
  if ((media.bitDepth ?? 8) > 8 && !capability.tenBit) return false;
  if (mediaHdr && !capability.hdrTypes.includes(mediaHdr)) return false;
  if (media.bitrate && capability.maxBitrateKbps && media.bitrate > capability.maxBitrateKbps) return false;
  return !caps.maxVideoBitrateKbps || !media.bitrate || media.bitrate <= caps.maxVideoBitrateKbps;
}

function clientProfileExtra(caps: DeviceCapabilities): string {
  // PMS profile-extra syntax is undocumented; keep this isolated until validated against a live server.
  return caps.video.map((video) => `add-transcode-target(type=videoProfile&context=streaming&protocol=hls&videoCodec=${video.codec})`).join("+");
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
  if (!selected) throw new NativeError(422, "unsupported_media", "No playable media version is available.");
  if (request.mediaId && String(selected.id) !== request.mediaId) throw new NativeError(404, "not_found", "Media version not found.");
  const parts = selected.Part ?? [];
  if (!parts.length || parts.some((part) => !Number.isSafeInteger(part.duration) || (part.duration ?? 0) <= 0)) {
    throw new NativeError(422, "unsupported_media", "All media parts must have a duration.");
  }
  const streams = (parts[0].Stream ?? []) as Stream[];
  const audio = streams.filter((stream) => stream.streamType === 2);
  const subtitles = streams.filter((stream) => stream.streamType === 3);
  const selectedAudio = request.audioStreamId ? audio.find((stream) => String(stream.id) === request.audioStreamId) : audio.find((stream) => stream.selected) ?? audio[0];
  const selectedSubtitle = request.subtitlesOff ? undefined : request.subtitleStreamId ? subtitles.find((stream) => String(stream.id) === request.subtitleStreamId) : subtitles.find((stream) => stream.selected);
  if (request.audioStreamId && !selectedAudio) throw new NativeError(404, "not_found", "Audio stream not found.");
  if (request.subtitleStreamId && !selectedSubtitle) throw new NativeError(404, "not_found", "Subtitle stream not found.");
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
  const sourceHdr = hdr(selected);
  const videoSupported = videoFits(selected, request.capabilities);
  const audioSupported = !selectedAudio?.codec || request.capabilities.audio.some((entry) => entry.codec === selectedAudio.codec && entry.maxChannels >= (selectedAudio.channels ?? 1));
  const subtitleCodec = selectedSubtitle?.codec as SubtitleCodec | undefined;
  const subtitleClient = !selectedSubtitle || ((selectedSubtitle.key || ["srt", "vtt", "mov_text", "ass", "ssa"].includes(subtitleCodec ?? "")) && request.capabilities.subtitles.includes(subtitleCodec!));
  const original = request.quality === "original";
  const directFile = original && !request.forceTranscode && videoSupported && audioSupported && subtitleClient && request.capabilities.containers.includes((selected.container ?? selectedPart.container) as DeviceCapabilities["containers"][number]);
  const method = directFile ? "direct_play" : videoSupported && original && !request.forceTranscode ? "direct_stream" : "transcode";
  const playbackId = randomUUID();
  const clientId = `${process.env.PLEX_CLIENT_ID ?? "watchtower-001"}-${playbackId}`;
  const profile = QUALITY_PROFILES.find((quality) => quality.id === request.quality);
  if (!profile) throw new NativeError(400, "invalid_request", "Unknown quality profile.");
  let hlsQuery: string | null = null;
  let plexDecision: PlaybackDescriptor["delivery"]["plexDecision"] = null;
  if (directFile) {
    for (const part of descriptorParts) part.url = `/api/v1/playback/${playbackId}/file/${part.partId}`;
  } else {
    await recheckPrincipal(principal);
    const selection = {
      ...(selectedAudio ? { audioStreamID: selectedAudio.id } : {}),
      subtitleStreamID: selectedSubtitle ? selectedSubtitle.id : 0,
    };
    plexData(await client.setStreamSelection(selectedPart.id, selection));
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
      subtitles: selectedSubtitle && !subtitleClient ? "burn" : "none",
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
    allowedSubtitleStreams: Object.fromEntries(subtitles.filter((stream) => stream.key && ["srt", "vtt"].includes(stream.codec ?? "")).map((stream) => [String(stream.id), stream.key!])),
    delivery: directFile ? "file" : "hls",
    hlsQuery,
  });
  if (request.replacesPlaybackId && ownedNativePlaybackSession(request.replacesPlaybackId, principal)) replaceNativePlaybackSession(request.replacesPlaybackId);
  const subtitleSidecar = selectedSubtitle?.key && subtitleClient ? `/api/v1/playback/${playbackId}/subtitles/${selectedSubtitle.id}` : null;
  return {
    playbackId,
    expiresInMs: 6 * 60 * 60 * 1000,
    media: { serverMachineId: principal.serverMachineId, ratingKey: request.ratingKey, mediaId: String(selected.id), partId: String(selectedPart.id) },
    item: mediaSummary(metadata),
    durationMs: totalDuration,
    startPositionMs,
    resumeSource: request.startPositionMs === null ? metadata.viewOffset ? "saved" : "start" : "request",
    delivery: { type: directFile ? "file" : "hls", method, plexDecision, mimeType: directFile ? `video/${selected.container ?? selectedPart.container ?? "mp4"}` : "application/vnd.apple.mpegurl", parts: descriptorParts, activePartIndex, timeline: { mapping: directFile ? "absolute" : "unknown", requestedOffsetMs: directFile ? startPositionMs : descriptorParts[activePartIndex].startMs + Math.floor((startPositionMs - descriptorParts[activePartIndex].startMs) / 1000) * 1000 } },
    source: { videoCodec: selected.videoCodec ?? null, width: selected.width ?? null, height: selected.height ?? null, hdr: sourceHdr, bitrateKbps: selected.bitrate ?? null, audioCodec: selected.audioCodec ?? null, audioChannels: selected.audioChannels ?? null, container: selected.container ?? null },
    quality: { requested: request.quality, options: QUALITY_PROFILES.map((quality) => ({ id: quality.id, label: quality.label, maxBitrateKbps: quality.maxBitrate ?? null, resolution: quality.resolution ?? null })), transcodeTarget: method === "transcode" ? { maxBitrateKbps: profile.maxBitrate ?? null, resolution: profile.resolution ?? null } : null },
    tracks: { audio: audio.map(audioTrack), subtitles: subtitles.map(subtitleTrack), selectedAudioStreamId: selectedAudio ? String(selectedAudio.id) : null, selectedSubtitleStreamId: selectedSubtitle ? String(selectedSubtitle.id) : null, subtitleDelivery: !selectedSubtitle ? "none" : !subtitleClient ? "burned" : selectedSubtitle.key ? "sidecar" : "embedded", sidecarUrl: subtitleSidecar },
    markers: (metadata.Marker ?? []).filter((marker) => marker.type === "intro" || marker.type === "credits").map((marker) => ({ type: marker.type as "intro" | "credits", startMs: marker.startTimeOffset, endMs: marker.endTimeOffset, final: Boolean(marker.final) })),
    nextItem: null,
    previousItem: null,
    autoplay: { autoSkipIntro: false, autoPlayNextEpisode: true },
    heartbeatIntervalMs: 30_000,
    timelineIntervalMs: 10_000,
    diagnostics: [directFile ? "Direct file matches declared capabilities." : method === "direct_stream" ? "Video copied through HLS; another stream requires conversion." : "Video transcoded for declared capabilities or quality."],
  };
}