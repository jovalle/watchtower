import type { PlexMarker } from "./types";

export interface PlaybackMarker {
  type: "intro" | "credits";
  start: number; // seconds
  end: number; // seconds
}

/** Converts Plex markers (ms) to intro/credits windows in seconds, dropping other types. */
export function toPlaybackMarkers(markers: PlexMarker[] | undefined): PlaybackMarker[] {
  return (markers ?? [])
    .filter((m): m is PlexMarker & { type: "intro" | "credits" } => m.type === "intro" || m.type === "credits")
    .filter((m) => m.endTimeOffset > m.startTimeOffset)
    .map((m) => ({ type: m.type, start: m.startTimeOffset / 1000, end: m.endTimeOffset / 1000 }));
}

export function findActiveMarker(markers: PlaybackMarker[], time: number): PlaybackMarker | null {
  return markers.find((m) => time >= m.start && time < m.end) ?? null;
}

/** Returns the item after `ratingKey` in an ordered episode list, or null if it is last or missing. */
export function findNextEpisode<T extends { ratingKey: string }>(episodes: T[], ratingKey: string): T | null {
  const index = episodes.findIndex((e) => e.ratingKey === ratingKey);
  return index >= 0 && index < episodes.length - 1 ? episodes[index + 1] : null;
}
