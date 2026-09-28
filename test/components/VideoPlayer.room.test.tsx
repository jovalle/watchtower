import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchRoomController } from "~/hooks/useWatchRoom";
import type { RoomSnapshot } from "~/lib/rooms/protocol";
import { VideoPlayer } from "~/components/player/VideoPlayer";
import fixtures from "../fixtures/rooms/v1/fixtures.json";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@remix-run/react", () => ({ useNavigate: () => navigate }));
vi.mock("hls.js", () => ({
  default: class {
    static isSupported() { return true; }
    attachMedia() {}
    loadSource() {}
    on() {}
    destroy() {}
  },
  Events: { MEDIA_ATTACHED: "attached", ERROR: "error" },
  ErrorTypes: { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" },
}));

const session = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";
const baseSnapshot = structuredClone(fixtures.createResponse.snapshot) as RoomSnapshot;
const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
let paused = true;

function controller(
  isHost: boolean,
  snapshot: RoomSnapshot = baseSnapshot
): WatchRoomController {
  return {
    roomId: snapshot.roomId,
    status: "connected",
    snapshot: {
      ...snapshot,
      hostParticipantId: isHost
        ? snapshot.participants[0].participantId
        : "99999999-9999-4999-8999-999999999999",
    },
    participantId: snapshot.participants[0].participantId,
    isHost,
    clockOffsetMs: 0,
    clockRttMs: 40,
    clockUncertaintyMs: 20,
    readyRequest: 0,
    playbackArmed: true,
    message: null,
    sendIntent: vi.fn().mockResolvedValue(true),
    reportPresence: vi.fn().mockResolvedValue(true),
    observePresence: vi.fn(),
    prepareSourceReplacement: vi.fn().mockResolvedValue(true),
    setPlaybackArmed: vi.fn(),
    explainHostOnly: vi.fn(),
  };
}

function renderPlayer(room: WatchRoomController, props: Record<string, unknown> = {}) {
  return render(
    <VideoPlayer
      src={`/api/plex/stream/42?session=${session}`}
      title="Example"
      ratingKey="42"
      durationMs={100_000}
      room={room}
      {...props}
    />
  );
}

beforeEach(() => {
  paused = true;
  navigate.mockReset();
  handlers.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  );
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), {
      sendBeacon: vi.fn(() => true),
      mediaSession: {
        setActionHandler: vi.fn(
          (action: MediaSessionAction, handler: MediaSessionActionHandler | null) =>
            handlers.set(action, handler)
        ),
      },
    })
  );
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get: () => paused,
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    if (!paused) {
      paused = true;
      this.dispatchEvent(new Event("pause"));
    }
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("room intent gate", () => {
  it("blocks non-host click, Space, arrows and Media Session without local transport", async () => {
    const room = controller(false);
    renderPlayer(room);
    const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
    fireEvent.canPlay(video);
    fireEvent.click(video);
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Forward 30 seconds" }));
    act(() => handlers.get("play")?.({ action: "play" }));

    expect(room.sendIntent).not.toHaveBeenCalled();
    expect(room.explainHostOnly).toHaveBeenCalledTimes(5);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
  });

  it("dispatches exactly one command for each host intent", () => {
    const room = controller(true);
    renderPlayer(room);
    const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
    fireEvent.canPlay(video);

    fireEvent.click(video);
    expect(room.sendIntent).toHaveBeenLastCalledWith({ type: "play", payload: {} });
    expect(room.sendIntent).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(room.sendIntent).toHaveBeenLastCalledWith({
      type: "seek",
      payload: { positionMs: 10_000 },
    });
    expect(room.sendIntent).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Forward 30 seconds" }));
    expect(room.sendIntent).toHaveBeenCalledTimes(3);

    act(() => handlers.get("pause")?.({ action: "pause" }));
    expect(room.sendIntent).toHaveBeenLastCalledWith({ type: "pause", payload: {} });
    expect(room.sendIntent).toHaveBeenCalledTimes(4);
  });
});

it("applies remote play, pause and seek without echo commands", async () => {
  const room = controller(true);
  const view = renderPlayer(room);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);
  vi.mocked(room.sendIntent).mockClear();

  const playingRoom = controller(true, {
    ...baseSnapshot,
    revision: 2,
    phase: "playing",
    anchor: {
      positionMs: 0,
      effectiveAtMs: performance.now(),
      rate: 1,
    },
  });
  view.rerender(
    <VideoPlayer
      src={`/api/plex/stream/42?session=${session}`}
      title="Example"
      ratingKey="42"
      durationMs={100_000}
      room={playingRoom}
    />
  );
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
  expect(room.sendIntent).not.toHaveBeenCalled();
  expect(playingRoom.sendIntent).not.toHaveBeenCalled();

  const pausedRoom = controller(true, {
    ...playingRoom.snapshot,
    revision: 3,
    phase: "paused",
    anchor: { positionMs: 5000, effectiveAtMs: 0, rate: 1 },
  });
  view.rerender(
    <VideoPlayer
      src={`/api/plex/stream/42?session=${session}`}
      title="Example"
      ratingKey="42"
      durationMs={100_000}
      room={pausedRoom}
    />
  );
  await waitFor(() => expect(video.currentTime).toBe(5));
  fireEvent.seeking(video);
  expect(room.sendIntent).not.toHaveBeenCalled();
  expect(playingRoom.sendIntent).not.toHaveBeenCalled();
  expect(pausedRoom.sendIntent).not.toHaveBeenCalled();
});

it("keeps a pending remote seek suppressed across a snapshot revision", async () => {
  const initialRoom = controller(true, {
    ...baseSnapshot,
    revision: 2,
    phase: "paused",
    anchor: { positionMs: 5000, effectiveAtMs: 0, rate: 1 },
  });
  const view = renderPlayer(initialRoom);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);
  await waitFor(() => expect(video.currentTime).toBe(5));

  const revisedRoom = controller(true, {
    ...initialRoom.snapshot,
    revision: 3,
  });
  view.rerender(
    <VideoPlayer
      src={`/api/plex/stream/42?session=${session}`}
      title="Example"
      ratingKey="42"
      durationMs={100_000}
      room={revisedRoom}
    />
  );
  fireEvent.seeking(video);

  expect(initialRoom.sendIntent).not.toHaveBeenCalled();
  expect(revisedRoom.sendIntent).not.toHaveBeenCalled();
});

it("never autoplays or applies personal resume on room canplay", () => {
  const room = controller(false);
  renderPlayer(room, { resumePositionSeconds: 60 });
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(video.currentTime).not.toBe(60);
});

it("arms only after a successful ready gesture", async () => {
  const initialRoom = {
    ...controller(false),
    playbackArmed: false,
  };
  const view = renderPlayer(initialRoom);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_FUTURE_DATA,
  });
  fireEvent.canPlay(video);
  expect(
    vi.mocked(initialRoom.reportPresence).mock.calls.some(
      ([presence]) => presence.ready
    )
  ).toBe(false);

  view.rerender(
    <VideoPlayer
      src={`/api/plex/stream/42?session=${session}`}
      title="Example"
      ratingKey="42"
      durationMs={100_000}
      room={{ ...initialRoom, readyRequest: 1 }}
    />
  );
  await waitFor(() =>
    expect(initialRoom.setPlaybackArmed).toHaveBeenCalledWith(true)
  );
});

it("reports autoplay_blocked when the ready gesture cannot start media", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
    new DOMException("Gesture required", "NotAllowedError")
  );
  const room = {
    ...controller(false),
    playbackArmed: false,
  };
  const view = renderPlayer(room);
  view.rerender(
    <VideoPlayer
      src={`/api/plex/stream/42?session=${session}`}
      title="Example"
      ratingKey="42"
      durationMs={100_000}
      room={{ ...room, readyRequest: 1 }}
    />
  );

  await waitFor(() =>
    expect(room.reportPresence).toHaveBeenCalledWith(
      expect.objectContaining({ ready: false, error: "autoplay_blocked" })
    )
  );
  expect(room.setPlaybackArmed).toHaveBeenCalledWith(false);
});

it("automatically reclaims readiness when the preparation generation changes", async () => {
  const room = controller(false, {
    ...baseSnapshot,
    phase: "paused",
    anchor: { positionMs: 0, effectiveAtMs: 0, rate: 1 },
  });
  const view = renderPlayer(room);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_FUTURE_DATA,
  });
  fireEvent.canPlay(video);
  await waitFor(() =>
    expect(room.reportPresence).toHaveBeenCalledWith(
      expect.objectContaining({ ready: true, playbackSessionId: session })
    )
  );

  const nextGeneration = controller(false, {
    ...room.snapshot,
    presenceRevision: room.snapshot.presenceRevision + 1,
    preparationGeneration: room.snapshot.preparationGeneration + 1,
    participants: room.snapshot.participants.map((participant) => ({
      ...participant,
      ready: false,
    })),
  });
  vi.mocked(nextGeneration.reportPresence).mockClear();
  view.rerender(
    <VideoPlayer
      src={`/api/plex/stream/42?session=${session}`}
      title="Example"
      ratingKey="42"
      durationMs={100_000}
      room={nextGeneration}
    />
  );
  await waitFor(() =>
    expect(nextGeneration.reportPresence).toHaveBeenCalledWith(
      expect.objectContaining({ ready: true, playbackSessionId: session })
    )
  );
});

it("ignores small unsolicited seeks and reconciles a large non-host seek", async () => {
  const room = {
    ...controller(false, {
      ...baseSnapshot,
      phase: "paused",
      anchor: { positionMs: 0, effectiveAtMs: 0, rate: 1 },
    }),
    playbackArmed: false,
  };
  renderPlayer(room);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);

  video.currentTime = 1;
  fireEvent.seeking(video);
  expect(room.explainHostOnly).not.toHaveBeenCalled();

  video.currentTime = 5;
  fireEvent.seeking(video);
  expect(room.explainHostOnly).toHaveBeenCalledOnce();
  await waitFor(() => expect(video.currentTime).toBe(0));
  expect(room.sendIntent).not.toHaveBeenCalled();
});

it("turns a large unsolicited host seek into one room intent", async () => {
  const room = {
    ...controller(true, {
      ...baseSnapshot,
      phase: "paused",
      anchor: { positionMs: 0, effectiveAtMs: 0, rate: 1 },
    }),
    playbackArmed: false,
  };
  renderPlayer(room);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);
  vi.mocked(room.sendIntent).mockClear();

  video.currentTime = 5;
  fireEvent.seeking(video);

  expect(room.sendIntent).toHaveBeenCalledOnce();
  expect(room.sendIntent).toHaveBeenCalledWith({
    type: "seek",
    payload: { positionMs: 5000 },
  });
  await act(async () => Promise.resolve());
  expect(video.currentTime).toBe(5);
});

it("reloads an unbuffered room stream instead of assigning currentTime", async () => {
  const room = controller(true, {
    ...baseSnapshot,
    phase: "paused",
    anchor: { positionMs: 50_000, effectiveAtMs: 0, rate: 1 },
  });
  renderPlayer(room, { playbackMethod: "direct_stream" });
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);

  await waitFor(() =>
    expect(room.prepareSourceReplacement).toHaveBeenCalledWith({
      playbackSessionId: session,
      positionMs: 50_000,
    })
  );
  expect(video.currentTime).toBe(0);
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith(
      `/app/watch/42?room=${room.roomId}`,
      { replace: true }
    )
  );
});

it("does not execute a scheduled play before the user arms playback", async () => {
  vi.useFakeTimers();
  const room = {
    ...controller(true, {
      ...baseSnapshot,
      phase: "playing",
      anchor: {
        positionMs: 10_000,
        effectiveAtMs: performance.now() + 100,
        rate: 1,
      },
    }),
    playbackArmed: false,
  };
  renderPlayer(room);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
  });

  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(room.setPlaybackArmed).toHaveBeenCalledWith(false);
  expect(room.reportPresence).toHaveBeenCalledWith(
    expect.objectContaining({ ready: false, error: "autoplay_blocked" })
  );
});

it("reloads an unbuffered scheduled pre-seek without playing the old source", async () => {
  const room = {
    ...controller(true, {
      ...baseSnapshot,
      phase: "playing",
      anchor: {
        positionMs: 50_000,
        effectiveAtMs: performance.now() + 1000,
        rate: 1,
      },
    }),
    playbackArmed: false,
  };
  renderPlayer(room, { playbackMethod: "transcode" });

  await waitFor(() =>
    expect(room.prepareSourceReplacement).toHaveBeenCalledWith({
      playbackSessionId: session,
      positionMs: 50_000,
    })
  );
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it("seeks a late scheduled start to the live target without playing when unarmed", async () => {
  const now = performance.now();
  const room = {
    ...controller(true, {
      ...baseSnapshot,
      phase: "playing",
      anchor: {
        positionMs: 10_000,
        effectiveAtMs: now - 1000,
        rate: 1,
      },
    }),
    playbackArmed: false,
  };
  renderPlayer(room);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);

  await waitFor(() => expect(video.currentTime).toBeGreaterThanOrEqual(10.9));
  expect(video.currentTime).toBeLessThan(11.5);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it("keeps the media paused when the room is terminal", () => {
  paused = false;
  const room = {
    ...controller(false),
    status: "ended" as const,
  };
  renderPlayer(room);

  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(paused).toBe(true);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it("acknowledges source replacement before quality navigation and preserves room", async () => {
  const room = controller(true);
  renderPlayer(room, {
    quality: { id: "original", label: "Original", isOriginal: true },
    availableQualities: [
      { id: "original", label: "Original", isOriginal: true },
      { id: "720p-4", label: "720p", isOriginal: false },
    ],
  });
  fireEvent.canPlay(screen.getByLabelText("Video player: Example"));
  fireEvent.click(screen.getByLabelText("Settings"));
  fireEvent.click(screen.getByText("720p"));
  await waitFor(() => expect(room.prepareSourceReplacement).toHaveBeenCalledOnce());
  expect(navigate).toHaveBeenCalledWith(
    `/app/watch/42?room=${room.roomId}&quality=720p-4&transcode=1`,
    { replace: true }
  );
  expect(
    vi.mocked(room.prepareSourceReplacement).mock.invocationCallOrder[0]
  ).toBeLessThan(navigate.mock.invocationCallOrder[0]);
});

it("disables automatic intro and next actions but lets the host share Skip Intro", async () => {
  const room = controller(true);
  renderPlayer(room, {
    markers: [{ type: "intro", start: 5, end: 15 }],
    autoSkipIntro: true,
    autoPlayNextEpisode: true,
    nextEpisode: { ratingKey: "43", title: "Next", label: "S1:E2" },
  });
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);
  await act(async () => {
    video.currentTime = 6;
    fireEvent.timeUpdate(video);
  });
  await waitFor(() => expect(screen.getByText("Skip Intro")).toBeInTheDocument());
  expect(room.sendIntent).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Skip Intro"));
  expect(room.sendIntent).toHaveBeenCalledOnce();
  expect(room.sendIntent).toHaveBeenCalledWith({
    type: "seek",
    payload: { positionMs: 15_000 },
  });
  fireEvent.ended(video);
  expect(navigate).not.toHaveBeenCalled();
});

it("only scrobbles a room after continuous local playback crosses 90 percent", async () => {
  const room = controller(false);
  renderPlayer(room);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  fireEvent.canPlay(video);
  paused = false;

  video.currentTime = 95;
  fireEvent.timeUpdate(video);
  fireEvent.ended(video);
  expect(
    vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/plex/scrobble")
  ).toHaveLength(0);

  video.currentTime = 89;
  fireEvent.timeUpdate(video);
  video.currentTime = 91;
  fireEvent.timeUpdate(video);
  await waitFor(() =>
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/plex/scrobble")
    ).toHaveLength(1)
  );
});