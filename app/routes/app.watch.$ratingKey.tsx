/**
 * Video player page - plays media via HLS streaming from Plex.
 *
 * URL parameters:
 *   - t: Resume position in milliseconds (from Plex viewOffset)
 *   - quality: Quality profile ID (e.g., "original", "1080p-20")
 *   - transcode: Set to "1" to force transcoding
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { VideoPlayer } from "~/components/player";
import { requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import { QUALITY_PROFILES } from "~/lib/plex/types";
import type { QualityProfile, PlaybackMethod, PlexStream } from "~/lib/plex/types";
import { getPlaybackPref } from "~/lib/playback-prefs";

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
  serverUrl: string;
  token: string;
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
  episodes?: EpisodeInfo[];
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data?.title ?? "Video Player";
  return [
    { title: `${title} | Watching` },
    { name: "description", content: `Now playing: ${title}` },
  ];
};

function buildPlexImageUrl(
  serverUrl: string,
  token: string,
  path: string | undefined,
  width: number,
  height: number
): string {
  if (!path) return "";
  return `${serverUrl}/photo/:/transcode?width=${width}&height=${height}&minSize=1&upscale=1&url=${encodeURIComponent(path)}&X-Plex-Token=${token}`;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requirePlexToken(request);
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
  const metadataResult = await client.getMetadata(ratingKey);
  if (!metadataResult.success) {
    throw new Response("Media not found", { status: 404 });
  }
  const metadata = metadataResult.data;

  // Parse URL parameters
  const url = new URL(request.url);
  const queryTimeMs = parseInt(url.searchParams.get("t") || "0", 10);
  const qualityId = url.searchParams.get("quality") || "original";
  const forceTranscodeParam = url.searchParams.get("transcode") === "1";

  // Determine resume position (milliseconds -> seconds)
  // Priority: query param > metadata viewOffset > 0
  let resumeMs = 0;
  let resumeSource = "none";

  if (!isNaN(queryTimeMs) && queryTimeMs > 0) {
    resumeMs = queryTimeMs;
    resumeSource = "query";
  } else if (metadata.viewOffset && metadata.viewOffset > 0) {
    resumeMs = metadata.viewOffset;
    resumeSource = "metadata";
  }

  // Convert to seconds for Plex offset parameter
  const resumeSeconds = Math.floor(resumeMs / 1000);

  // Check stored playback preference
  const cookieHeader = request.headers.get("Cookie");
  const storedPref = getPlaybackPref(cookieHeader, ratingKey);
  const useStoredTranscode = storedPref === "transcode" && !forceTranscodeParam && qualityId === "original";
  const forceTranscode = forceTranscodeParam || useStoredTranscode;

  // Select quality profile
  const effectiveQualityId = useStoredTranscode ? "1080p-20" : qualityId;
  const selectedQuality = QUALITY_PROFILES.find((q) => q.id === effectiveQualityId) || QUALITY_PROFILES[0];

  // Get stream URL - offset is in SECONDS
  const playbackInfo = client.getPlaybackInfo(ratingKey, {
    offsetSeconds: resumeSeconds,
    quality: selectedQuality,
    forceTranscode,
  });

  // Logging
  console.log(`[Watch] Media: ${ratingKey}, Resume: ${resumeSeconds}s (from ${resumeSource})`);
  console.log(`[Watch] Quality: ${selectedQuality.id}, Method: ${playbackInfo.method}`);

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
  const media = metadata.Media?.[0];
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

  return json<LoaderData>({
    streamUrl: playbackInfo.streamUrl,
    title: displayTitle,
    posterUrl: buildPlexImageUrl(
      env.PLEX_SERVER_URL,
      token,
      metadata.art || metadata.thumb,
      1280,
      720
    ),
    durationMs: metadata.duration || null,
    resumePositionSeconds: resumeSeconds,
    type: metadata.type as "movie" | "show" | "episode",
    ratingKey,
    parentTitle: metadata.parentTitle,
    grandparentTitle: metadata.grandparentTitle,
    parentRatingKey: metadata.parentRatingKey,
    parentIndex: metadata.parentIndex,
    index: metadata.index,
    serverUrl: env.PLEX_SERVER_URL,
    token,
    quality: playbackInfo.quality,
    availableQualities: playbackInfo.availableQualities,
    playbackMethod: playbackInfo.method,
    mediaInfo: {
      videoCodec: media?.videoCodec,
      audioCodec: media?.audioCodec,
      resolution: media?.videoResolution,
      bitrate: media?.bitrate,
    },
    audioTracks,
    subtitleTracks,
    episodes,
  });
}

export default function WatchPage() {
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
    serverUrl,
    token,
    quality,
    availableQualities,
    playbackMethod,
    mediaInfo,
    audioTracks,
    subtitleTracks,
    episodes,
  } = useLoaderData<typeof loader>();

  // Build title/subtitle for episodes
  let mainTitle = title;
  let subtitle: string | undefined;
  if (type === "episode" && grandparentTitle) {
    mainTitle = grandparentTitle;
    subtitle = title.replace(`${grandparentTitle} - `, "");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <VideoPlayer
        src={streamUrl}
        title={mainTitle}
        subtitle={subtitle}
        posterUrl={posterUrl}
        durationMs={durationMs}
        resumePositionSeconds={resumePositionSeconds}
        ratingKey={ratingKey}
        serverUrl={serverUrl}
        token={token}
        quality={quality}
        availableQualities={availableQualities}
        playbackMethod={playbackMethod}
        mediaInfo={mediaInfo}
        audioTracks={audioTracks}
        subtitleTracks={subtitleTracks}
        episodes={episodes}
        seasonTitle={parentTitle}
        seasonNumber={parentIndex}
        episodeNumber={index}
      />
    </div>
  );
}
