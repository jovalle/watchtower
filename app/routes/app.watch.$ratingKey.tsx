/**
 * Video player page - plays media via HLS streaming from Plex.
 *
 * URL parameters:
 *   - t: Resume position in milliseconds (from Plex viewOffset)
 *   - quality: Quality profile ID (e.g., "original", "1080p-20")
 *   - transcode: Set to "1" to force transcoding
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useEffect } from "react";
import { useLoaderData, useNavigate, useOutletContext } from "@remix-run/react";
import { VideoPlayer } from "~/components/player";
import {
  CreateRoomDialog,
  RoomPanel,
  RoomTakeover,
  RoomTerminal,
} from "~/components/rooms";
import { useWatchRoom } from "~/hooks/useWatchRoom";
import { requireServerToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import { QUALITY_PROFILES } from "~/lib/plex/types";
import type {
  QualityProfile,
  PlaybackMethod,
  PlexStream,
} from "~/lib/plex/types";
import { getPlaybackPref } from "~/lib/playback-prefs";
import { parsePlaybackCaps, canDirectPlay } from "~/lib/playback-caps";
import { canSidecar, selectedTrackNeeds } from "~/lib/plex/tracks";
import {
  toPlaybackMarkers,
  findNextEpisode,
  type PlaybackMarker,
} from "~/lib/plex/markers";
import { getCurrentUser } from "~/lib/auth/user.server";
import {
  getUserSettings,
  DEFAULT_PREFERENCES,
} from "~/lib/settings/storage.server";
import {
  getWebDevice,
  resolveRoomPrincipal,
} from "~/lib/rooms/principal.server";
import {
  getMemberPlaybackContext,
  isWatchTogetherEnabled,
} from "~/lib/rooms/coordinator.server";

interface AudioTrack {
  id: number;
  displayTitle: string;
  language?: string;
  languageCode?: string;
  codec?: string;
  channels?: number;
  selected?: boolean;
}

interface SubtitleTrack {
  id: number;
  displayTitle: string;
  language?: string;
  languageCode?: string;
  codec?: string;
  selected?: boolean;
  sidecarUrl?: string;
}

interface EpisodeInfo {
  ratingKey: string;
  title: string;
  index: number;
  thumb?: string;
  summary?: string;
  duration?: number;
  viewOffset?: number;
  viewCount?: number;
}

interface LoaderData {
  streamUrl: string;
  title: string;
  posterUrl: string;
  durationMs: number | null;
  resumePositionSeconds: number;
  type: "movie" | "show" | "episode";
  ratingKey: string;
  parentTitle?: string;
  grandparentTitle?: string;
  parentRatingKey?: string;
  parentIndex?: number;
  index?: number;
  quality: QualityProfile;
  availableQualities: QualityProfile[];
  playbackMethod: PlaybackMethod;
  mediaInfo: {
    videoCodec?: string;
    audioCodec?: string;
    resolution?: string;
    bitrate?: number;
  };
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  partId?: number;
  burnedSubtitleId: number | null;
  episodes?: EpisodeInfo[];
  markers: PlaybackMarker[];
  nextEpisode: NextEpisodeInfo | null;
  autoSkipIntro: boolean;
  autoPlayNextEpisode: boolean;
  mediaId: string;
  partIdValue: string | null;
  partCount: number;
  roomId: string | null;
  togetherRequested: boolean;
  room: ReturnType<typeof getMemberPlaybackContext>;
  watchTogetherEnabled: boolean;
}

interface NextEpisodeInfo {
  ratingKey: string;
  title: string;
  label: string;
  thumbUrl?: string;
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data?.title ?? "Video Player";
  return [
    { title: `${title} | Watching` },
    { name: "description", content: `Now playing: ${title}` },
  ];
};

// Use shared image URL helper
import { buildBackdropUrl } from "~/lib/plex/images";

/**
 * Detect if the request is from a mobile device.
 * Mobile devices often can't play certain video codecs natively.
 */
function isMobileDevice(userAgent: string): boolean {
  const mobilePatterns = [
    /iPhone/i,
    /iPad/i,
    /iPod/i,
    /Android/i,
    /webOS/i,
    /BlackBerry/i,
    /Windows Phone/i,
    /Mobile/i,
  ];
  return mobilePatterns.some((pattern) => pattern.test(userAgent));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const { ratingKey } = params;

  if (!ratingKey) {
    throw new Response("Missing rating key", { status: 400 });
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  // Fetch metadata
  const [metadataResult, user] = await Promise.all([
    client.getMetadata(ratingKey, { includeMarkers: true }),
    getCurrentUser(request),
  ]);
  if (!metadataResult.success) {
    throw new Response("Media not found", { status: 404 });
  }
  const metadata = metadataResult.data;
  const preferences = user
    ? (await getUserSettings(user.id))?.preferences ?? DEFAULT_PREFERENCES
    : DEFAULT_PREFERENCES;

  // Detect mobile device for automatic transcoding
  const userAgent = request.headers.get("User-Agent") || "";
  const isMobile = isMobileDevice(userAgent);

  // Parse URL parameters
  const url = new URL(request.url);
  const queryTime = url.searchParams.get("t");
  const queryTimeMs = queryTime !== null && /^\d+$/.test(queryTime)
    ? Number(queryTime)
    : NaN;
  const qualityId = url.searchParams.get("quality") || "original";
  const forceTranscodeParam = url.searchParams.get("transcode") === "1";
  const roomId = url.searchParams.get("room");
  const togetherRequested = url.searchParams.get("together") === "1";
  const watchTogetherEnabled = isWatchTogetherEnabled();

  let room: ReturnType<typeof getMemberPlaybackContext> = null;
  let device: Awaited<ReturnType<typeof getWebDevice>>;
  if (roomId && watchTogetherEnabled) {
    const principal = await resolveRoomPrincipal(request);
    if (principal.ok) {
      room = getMemberPlaybackContext(roomId, principal.principal);
      device = {
        deviceSessionId: principal.principal.deviceSessionId,
        setCookie: principal.setCookie,
      };
      if (room && room.ratingKey !== ratingKey) {
        throw redirect(
          `/app/watch/${encodeURIComponent(room.ratingKey)}?room=${encodeURIComponent(roomId)}`,
          principal.setCookie
            ? { headers: { "Set-Cookie": principal.setCookie } }
            : undefined
        );
      }
    } else {
      device = await getWebDevice(request);
    }
  } else {
    device = await getWebDevice(request);
  }

  // Determine resume position (milliseconds -> seconds)
  // Priority: query param > metadata viewOffset > 0
  let resumeMs = 0;
  let resumeSource = "none";

  if (Number.isSafeInteger(queryTimeMs) && queryTimeMs >= 0) {
    resumeMs = queryTimeMs;
    resumeSource = "query";
  } else if (room) {
    resumeMs = room.targetPositionMs;
    resumeSource = "room";
  } else if (metadata.viewOffset && metadata.viewOffset > 0) {
    resumeMs = metadata.viewOffset;
    resumeSource = "metadata";
  }

  // Convert to seconds for Plex offset parameter
  const resumeSeconds = Math.floor(resumeMs / 1000);

  // Check stored playback preference
  const cookieHeader = request.headers.get("Cookie");
  const storedPref = getPlaybackPref(cookieHeader, ratingKey);
  const useStoredTranscode =
    storedPref === "transcode" &&
    !forceTranscodeParam &&
    qualityId === "original";

  // Play the file as-is when the browser reported it can decode the container and codecs
  const media = metadata.Media?.[0];
  // A room plays exactly the edition it was created with; never substitute Plex's current default.
  if (
    room &&
    (String(media?.id) !== room.mediaId ||
      String(media?.Part?.[0]?.id) !== room.partId)
  ) {
    throw new Response(
      "This room's title changed on Plex. Create a new room to keep watching together.",
      { status: 409 }
    );
  }
  const caps = parsePlaybackCaps(cookieHeader);
  const videoStream = media?.Part?.[0]?.Stream?.find((s) => s.streamType === 1);
  // Browsers can't burn in subtitles or pick a non-default audio track from a file, so those need HLS.
  const trackNeeds = selectedTrackNeeds(media?.Part?.[0]?.Stream ?? []);
  const directFile =
    !!caps &&
    !!media &&
    qualityId === "original" &&
    !forceTranscodeParam &&
    !useStoredTranscode &&
    trackNeeds.burnSubtitleId === null &&
    !trackNeeds.nonDefaultAudio &&
    canDirectPlay(media, caps, videoStream?.DOVIProfile);

  // Force transcoding for mobile devices to ensure compatible H.264/AAC format
  // Mobile browsers (especially iOS Safari) have limited codec support
  const forceTranscode =
    forceTranscodeParam || useStoredTranscode || (isMobile && !directFile);

  // Select quality profile - use 1080p transcoding for mobile or stored preference
  const effectiveQualityId =
    useStoredTranscode || (isMobile && !directFile && qualityId === "original")
      ? "1080p-20"
      : qualityId;
  const selectedQuality =
    QUALITY_PROFILES.find((q) => q.id === effectiveQualityId) ||
    QUALITY_PROFILES[0];

  // Get stream URL - offset is in SECONDS
  const playbackInfo = client.getPlaybackInfo(ratingKey, {
    offsetSeconds: resumeSeconds,
    quality: selectedQuality,
    forceTranscode,
    subtitles: trackNeeds.burnSubtitleId !== null ? "burn" : "none",
    // Room readiness needs sessions owned by this device; solo playback keeps its original shared scope.
    deviceScope: room ? device.deviceSessionId : undefined,
  });

  // Logging
  console.log(
    `[Watch] Media: ${ratingKey}, Resume: ${resumeSeconds}s (from ${resumeSource})`
  );
  console.log(
    `[Watch] Quality: ${selectedQuality.id}, Method: ${
      directFile ? "direct_file" : playbackInfo.method
    }, Mobile: ${isMobile}`
  );

  // Build display title
  let displayTitle = metadata.title;
  if (metadata.type === "episode" && metadata.grandparentTitle) {
    if (metadata.parentIndex !== undefined && metadata.index !== undefined) {
      displayTitle = `${metadata.grandparentTitle} - S${metadata.parentIndex}:E${metadata.index} - ${metadata.title}`;
    } else {
      displayTitle = `${metadata.grandparentTitle} - ${metadata.title}`;
    }
  }

  // Extract media info
  const part = media?.Part?.[0];
  const streams = part?.Stream || [];

  // Extract audio tracks (streamType 2)
  const audioTracks: AudioTrack[] = streams
    .filter((s: PlexStream) => s.streamType === 2)
    .map((s: PlexStream) => ({
      id: s.id,
      displayTitle: s.displayTitle || s.language || "Unknown",
      language: s.language,
      languageCode: s.languageCode,
      codec: s.codec,
      channels: s.channels,
      selected: s.selected,
    }));

  // Extract subtitle tracks (streamType 3)
  const subtitleTracks: SubtitleTrack[] = streams
    .filter((s: PlexStream) => s.streamType === 3)
    .map((s: PlexStream) => ({
      id: s.id,
      displayTitle: s.displayTitle || s.language || "Unknown",
      language: s.language,
      languageCode: s.languageCode,
      codec: s.codec,
      selected: s.selected,
      sidecarUrl: canSidecar(s) ? `/api/plex/subtitles/${s.id}` : undefined,
    }));

  // Fetch episodes if this is a TV episode
  let episodes: EpisodeInfo[] | undefined;
  if (metadata.type === "episode" && metadata.parentRatingKey) {
    const episodesResult = await client.getChildren(metadata.parentRatingKey);
    if (episodesResult.success) {
      episodes = episodesResult.data.map((ep) => ({
        ratingKey: ep.ratingKey,
        title: ep.title,
        index: ep.index || 0,
        thumb: ep.thumb,
        summary: ep.summary,
        duration: ep.duration,
        viewOffset: ep.viewOffset,
        viewCount: ep.viewCount,
      }));
    }
  }

  let nextEpisode: NextEpisodeInfo | null = null;
  if (metadata.type === "episode") {
    let next = episodes ? findNextEpisode(episodes, ratingKey) : null;
    let nextSeason = metadata.parentIndex;
    if (!next && metadata.grandparentRatingKey) {
      const leaves = await client.getAllLeaves(metadata.grandparentRatingKey);
      const leaf = leaves.success
        ? findNextEpisode(leaves.data, ratingKey)
        : null;
      if (leaf) {
        next = {
          ratingKey: leaf.ratingKey,
          title: leaf.title,
          index: leaf.index || 0,
          thumb: leaf.thumb,
        };
        nextSeason = leaf.parentIndex;
      }
    }
    if (next) {
      nextEpisode = {
        ratingKey: next.ratingKey,
        title: next.title,
        label:
          nextSeason !== undefined
            ? `S${nextSeason}:E${next.index}`
            : `Episode ${next.index}`,
        thumbUrl: next.thumb ? buildBackdropUrl(next.thumb) : undefined,
      };
    }
  }

  // Direct files go through the range-request proxy; everything else through the HLS proxy
  const plexUrl = new URL(playbackInfo.streamUrl);
  plexUrl.searchParams.delete("X-Plex-Token");
  const proxyStreamUrl = directFile
    ? `/api/plex/stream/${ratingKey}?session=${plexUrl.searchParams.get("session")}`
    : `/api/plex/hls/${ratingKey}/start.m3u8${plexUrl.search}`;

  return json<LoaderData>({
    streamUrl: proxyStreamUrl,
    title: displayTitle,
    posterUrl: buildBackdropUrl(metadata.art || metadata.thumb),
    durationMs: metadata.duration || null,
    resumePositionSeconds: resumeSeconds,
    type: metadata.type as "movie" | "show" | "episode",
    ratingKey,
    parentTitle: metadata.parentTitle,
    grandparentTitle: metadata.grandparentTitle,
    parentRatingKey: metadata.parentRatingKey,
    parentIndex: metadata.parentIndex,
    index: metadata.index,
    quality: playbackInfo.quality,
    availableQualities: playbackInfo.availableQualities,
    playbackMethod: directFile ? "direct_play" : playbackInfo.method,
    mediaInfo: {
      videoCodec: media?.videoCodec,
      audioCodec: media?.audioCodec,
      resolution: media?.videoResolution,
      bitrate: media?.bitrate,
    },
    audioTracks,
    subtitleTracks,
    partId: part?.id,
    burnedSubtitleId: trackNeeds.burnSubtitleId,
    episodes,
    markers: toPlaybackMarkers(metadata.Marker),
    nextEpisode,
    autoSkipIntro: preferences.autoSkipIntro,
    autoPlayNextEpisode: preferences.autoPlayNextEpisode,
    mediaId: String(media?.id ?? ""),
    partIdValue: part?.id === undefined ? null : String(part.id),
    partCount: media?.Part?.length ?? 0,
    roomId,
    togetherRequested,
    room,
    watchTogetherEnabled,
  }, device.setCookie ? { headers: { "Set-Cookie": device.setCookie } } : undefined);
}

export default function WatchPage() {
  const navigate = useNavigate();
  const { playbackBackTo } = useOutletContext<{ playbackBackTo: string }>();
  const {
    streamUrl,
    title,
    posterUrl,
    durationMs,
    resumePositionSeconds,
    type,
    ratingKey,
    grandparentTitle,
    parentTitle,
    parentIndex,
    index,
    quality,
    availableQualities,
    playbackMethod,
    mediaInfo,
    audioTracks,
    subtitleTracks,
    partId,
    burnedSubtitleId,
    episodes,
    markers,
    nextEpisode,
    autoSkipIntro,
    autoPlayNextEpisode,
    mediaId,
    partIdValue,
    partCount,
    roomId,
    togetherRequested,
    watchTogetherEnabled,
  } = useLoaderData<typeof loader>();

  const watchRoom = useWatchRoom({
    roomId,
    together: togetherRequested,
    watchTogetherEnabled,
    ratingKey,
    mediaId,
    partId: partIdValue,
    partCount,
    title,
    resumePositionMs: resumePositionSeconds * 1000,
    autoAdvance: autoPlayNextEpisode,
  });

  useEffect(() => {
    const nextRatingKey = watchRoom.controller?.snapshot.media.ratingKey;
    if (nextRatingKey && nextRatingKey !== ratingKey && roomId) {
      navigate(
        `/app/watch/${encodeURIComponent(nextRatingKey)}?room=${encodeURIComponent(roomId)}`,
        { replace: true }
      );
    }
  }, [navigate, ratingKey, roomId, watchRoom.controller?.snapshot.media.ratingKey]);

  // Build title/subtitle for episodes
  let mainTitle = title;
  let subtitle: string | undefined;
  if (type === "episode" && grandparentTitle) {
    mainTitle = grandparentTitle;
    subtitle = title.replace(`${grandparentTitle} - `, "");
  }

  return (
    <div data-player-page className="fixed inset-0 z-50 bg-black">
      {((!roomId && !togetherRequested) || watchRoom.controller) ? (
        <VideoPlayer
          key={streamUrl}
          backTo={playbackBackTo}
          src={streamUrl}
          title={mainTitle}
          subtitle={subtitle}
          posterUrl={posterUrl}
          durationMs={durationMs}
          resumePositionSeconds={resumePositionSeconds}
          ratingKey={ratingKey}
          quality={quality}
          availableQualities={availableQualities}
          playbackMethod={playbackMethod}
          mediaInfo={mediaInfo}
          audioTracks={audioTracks}
          subtitleTracks={subtitleTracks}
          partId={partId}
          burnedSubtitleId={burnedSubtitleId}
          episodes={episodes}
          seasonTitle={parentTitle}
          seasonNumber={parentIndex}
          episodeNumber={index}
          markers={markers}
          nextEpisode={nextEpisode}
          autoSkipIntro={autoSkipIntro}
          autoPlayNextEpisode={autoPlayNextEpisode}
          room={watchRoom.controller}
          roomPanel={
            watchRoom.controller &&
            watchRoom.state.status !== "ended" &&
            watchRoom.state.status !== "error" && (
              <RoomPanel
                controller={watchRoom.controller}
                title={title}
                invitation={watchRoom.state.invitation}
                pending={watchRoom.pending}
                message={watchRoom.message}
                reconnects={watchRoom.state.reconnects}
                diagnostics={watchRoom.diagnostics}
                lastErrorCode={watchRoom.state.lastErrorCode}
                onReady={watchRoom.requestReady}
                onLeave={() => void watchRoom.leave()}
                onContinueSolo={() => void watchRoom.continueSolo()}
                onInvitation={(action) => void watchRoom.updateInvitation(action)}
              />
            )
          }
          onRoomDiagnostics={watchRoom.reportDiagnostics}
        />
      ) : (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgb(0 0 0 / 70%), rgb(0 0 0 / 90%)), url(${posterUrl})` }} />
      )}

      {watchRoom.showCreateDialog && (
        <CreateRoomDialog
          title={title}
          resumePositionMs={resumePositionSeconds * 1000}
          pending={watchRoom.pending}
          disabled={watchRoom.createDisabled}
          disabledReason={watchRoom.createDisabledReason}
          error={watchRoom.message}
          onCreate={(positionMs) => void watchRoom.submitCreate(positionMs)}
          onCancel={watchRoom.cancelCreate}
        />
      )}
      {watchRoom.takeoverRequired && (
        <RoomTakeover
          pending={watchRoom.pending}
          onTakeover={() => void watchRoom.takeover()}
        />
      )}
      {roomId && watchRoom.state.status === "connecting" && (
        <div role="status" className="absolute inset-0 z-[55] flex items-center justify-center bg-black text-white">Connecting to room...</div>
      )}
      {togetherRequested && !watchTogetherEnabled && (
        <RoomTerminal
          message="Watch Together is currently disabled."
          onContinueSolo={watchRoom.continueSoloFromTerminal}
          onBack={() => navigate(playbackBackTo || "/app", { replace: true })}
        />
      )}
      {watchRoom.state.status === "error" && (
        <RoomTerminal
          message={watchRoom.message ?? "The room is no longer available."}
          onContinueSolo={watchRoom.continueSoloFromTerminal}
          onBack={() => navigate(playbackBackTo || "/app", { replace: true })}
        />
      )}
      {watchRoom.state.status === "ended" && (
        <RoomTerminal
          message={
            watchRoom.state.endedReason === "replaced"
              ? "This room moved to another tab or window."
              : watchRoom.state.endedReason === "server_restarted"
                ? "The room ended because the server restarted."
                : watchRoom.state.endedReason === "removed"
                  ? "The host removed this device from the room."
                  : watchRoom.state.endedReason === "access_denied"
                    ? "Your Plex profile cannot access the room's current title."
                    : watchRoom.state.endedReason === "expired"
                      ? "This room expired. Create a new room to continue together."
                : "This room has ended."
          }
          onContinueSolo={watchRoom.continueSoloFromTerminal}
          onBack={() => navigate(playbackBackTo || "/app", { replace: true })}
        />
      )}
    </div>
  );
}
