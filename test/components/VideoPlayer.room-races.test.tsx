import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "~/components/player/VideoPlayer";
import type { WatchRoomController } from "~/hooks/useWatchRoom";
import {
  BrowserRoomClient,
  type RoomClientState,
} from "~/lib/rooms/client";
import type {
  RoomCommand,
  RoomEnvelope,
  RoomSnapshot,
} from "~/lib/rooms/protocol";
import fixtures from "../fixtures/rooms/v1/fixtures.json";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@remix-run/react", () => ({ useNavigate: () => navigate }));
vi.mock("hls.js", () => ({
  default: class {
    static isSupported() {
      return true;
    }
    attachMedia() {}
    loadSource() {}
    on() {}
    destroy() {}
  },
  Events: { MEDIA_ATTACHED: "attached", ERROR: "error" },
  ErrorTypes: { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, (event: MessageEvent) => void>();
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }
}

const envelope = structuredClone(fixtures.createResponse) as RoomEnvelope;
const fixtureSnapshot = structuredClone(fixtures.createResponse.snapshot) as RoomSnapshot;
// The room is on the title the player under test shows.
const baseSnapshot: RoomSnapshot = {
  ...fixtureSnapshot,
  media: { ...fixtureSnapshot.media, ratingKey: "42" },
};
const playingSnapshot = structuredClone(fixtures.playingSnapshot) as RoomSnapshot;
const roomId = envelope.snapshot.roomId;
const playbackSession = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";
const mediaHandlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
let paused = true;

function clockResponse() {
  return new Response(
    JSON.stringify({
      ...fixtures.clock,
      sentAtMs: fixtures.clock.receivedAtMs,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function makeClient(fetchImpl: typeof fetch = vi.fn()) {
  return new BrowserRoomClient(roomId, structuredClone(envelope), {
    fetch: fetchImpl,
    createEventSource: (url) => new FakeEventSource(url),
    now: () => 100,
  });
}

function controller(
  isHost: boolean,
  snapshot: RoomSnapshot = baseSnapshot,
  sendIntent?: (command: RoomCommand) => Promise<boolean>
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
    clockRttMs: 20,
    clockUncertaintyMs: 10,
    readyRequest: 0,
    playbackArmed: true,
    message: null,
    sendIntent:
      sendIntent ??
      vi.fn(async (command) => {
        await fetch(`/api/v1/rooms/${snapshot.roomId}/commands`, {
          method: "POST",
          body: JSON.stringify(command),
        });
        return true;
      }),
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
      src={`/api/plex/stream/42?session=${playbackSession}`}
      title="Example"
      ratingKey="42"
      durationMs={100_000}
      room={room}
      {...props}
    />
  );
}

function commandFetches() {
  return vi.mocked(fetch).mock.calls.filter(([url]) =>
    String(url).endsWith("/commands")
  );
}

beforeEach(() => {
  paused = true;
  navigate.mockReset();
  mediaHandlers.clear();
  FakeEventSource.instances = [];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), {
      sendBeacon: vi.fn(() => true),
      mediaSession: {
        setActionHandler: vi.fn(
          (action: MediaSessionAction, handler: MediaSessionActionHandler | null) =>
            mediaHandlers.set(action, handler)
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

describe("BrowserRoomClient adversarial ordering", () => {
  it("applies newer presence at one revision, ignores older state, and ends on epoch change", () => {
    const client = makeClient();
    expect(client.applySnapshot(playingSnapshot)).toBe(true);
    const presenceOnly = {
      ...playingSnapshot,
      presenceRevision: playingSnapshot.presenceRevision + 1,
      participants: [{ ...playingSnapshot.participants[0], buffering: true }],
    };
    expect(client.applySnapshot(presenceOnly)).toBe(true);
    expect(client.getState().snapshot?.participants[0].buffering).toBe(true);
    expect(
      client.applySnapshot({
        ...playingSnapshot,
        revision: playingSnapshot.revision - 1,
        presenceRevision: playingSnapshot.presenceRevision,
      })
    ).toBe(false);
    expect(client.getState().snapshot?.participants[0].buffering).toBe(true);

    expect(
      client.applySnapshot({
        ...presenceOnly,
        epoch: "99999999-9999-4999-8999-999999999999",
      })
    ).toBe(false);
    expect(client.getState()).toMatchObject({ status: "ended", endedReason: "server_restarted" });
  });

  it.each([401, 403, 404, 410])(
    "stops all recovery attempts after terminal HTTP %s",
    async (status) => {
      vi.useFakeTimers();
      const fetchImpl = vi.fn(async () => clockResponse());
      const client = makeClient(fetchImpl);
      await client.start();
      fetchImpl.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: status === 410 ? "room_ended" : "not_found", message: "Gone" } }),
          { status, headers: { "Content-Type": "application/json" } }
        )
      );
      FakeEventSource.instances[0].onerror?.(new Event("error"));
      await vi.waitFor(() =>
        expect(client.getState().status).toBe(status === 410 ? "ended" : "error")
      );
      const callsAtTermination = fetchImpl.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fetchImpl).toHaveBeenCalledTimes(callsAtTermination);
      client.stop();
    }
  );

  it("retries one lost command response byte-for-byte and never replays a 409", async () => {
    const bodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) throw new TypeError("response lost");
      return new Response(JSON.stringify({ accepted: true, snapshot: playingSnapshot }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = makeClient(fetchImpl);
    (client as unknown as { state: RoomClientState }).state = {
      ...client.getState(),
      status: "connected",
    };
    await expect(client.sendCommand({ type: "seek", payload: { positionMs: 9_000 } })).resolves.toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);

    fetchImpl.mockReset().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "stale_revision", message: "Changed" }, snapshot: playingSnapshot }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    );
    await expect(client.sendCommand({ type: "pause", payload: {} })).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(client.getState().lastErrorCode).toBe("stale_revision");
  });
});

describe("VideoPlayer room races", () => {
  it("does not POST commands for rapid remote play, pause, and seek snapshots", async () => {
    const sendIntent = vi.fn(async (command: RoomCommand) => {
      await fetch(`/api/v1/rooms/${roomId}/commands`, { method: "POST", body: JSON.stringify(command) });
      return true;
    });
    const initial = controller(true, { ...baseSnapshot, phase: "paused" }, sendIntent);
    const view = renderPlayer(initial);
    const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
    fireEvent.canPlay(video);
    vi.mocked(fetch).mockClear();

    const playing = controller(true, {
      ...initial.snapshot,
      revision: initial.snapshot.revision + 1,
      phase: "playing",
      anchor: { positionMs: 0, effectiveAtMs: performance.now(), rate: 1 },
    }, sendIntent);
    view.rerender(<VideoPlayer src={`/api/plex/stream/42?session=${playbackSession}`} title="Example" ratingKey="42" durationMs={100_000} room={playing} />);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());

    const pausedRoom = controller(true, {
      ...playing.snapshot,
      revision: playing.snapshot.revision + 1,
      phase: "paused",
      anchor: { positionMs: 7_000, effectiveAtMs: 0, rate: 1 },
    }, sendIntent);
    view.rerender(<VideoPlayer src={`/api/plex/stream/42?session=${playbackSession}`} title="Example" ratingKey="42" durationMs={100_000} room={pausedRoom} />);
    await waitFor(() => expect(video.currentTime).toBe(7));

    const revised = controller(true, {
      ...pausedRoom.snapshot,
      revision: pausedRoom.snapshot.revision + 1,
    }, sendIntent);
    view.rerender(<VideoPlayer src={`/api/plex/stream/42?session=${playbackSession}`} title="Example" ratingKey="42" durationMs={100_000} room={revised} />);
    fireEvent.seeking(video);

    expect(sendIntent).not.toHaveBeenCalled();
    expect(commandFetches()).toHaveLength(0);
  });

  it("ignores HLS-sized currentTime nudges below the hard-seek threshold", () => {
    const room = controller(true, {
      ...baseSnapshot,
      phase: "paused",
      anchor: { positionMs: 0, effectiveAtMs: 0, rate: 1 },
    });
    renderPlayer(room, { src: `/api/plex/hls/42/start.m3u8?session=${playbackSession}` });
    const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
    fireEvent.canPlay(video);
    vi.mocked(fetch).mockClear();
    video.currentTime = 1.49;
    fireEvent.seeking(video);
    expect(commandFetches()).toHaveLength(0);
  });

  it("blocks non-host keyboard and MediaSession transport without local changes or command POSTs", () => {
    const room = controller(false);
    renderPlayer(room);
    const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
    fireEvent.canPlay(video);
    vi.mocked(fetch).mockClear();
    const initialTime = video.currentTime;

    for (const key of [" ", "k", "ArrowLeft", "ArrowRight"]) {
      fireEvent.keyDown(window, { key });
    }
    act(() => mediaHandlers.get("play")?.({ action: "play" }));
    act(() => mediaHandlers.get("pause")?.({ action: "pause" }));
    act(() => mediaHandlers.get("seekto")?.({ action: "seekto", seekTime: 50 }));
    act(() => mediaHandlers.get("seekbackward")?.({ action: "seekbackward", seekOffset: 10 }));
    act(() => mediaHandlers.get("seekforward")?.({ action: "seekforward", seekOffset: 10 }));
    act(() => mediaHandlers.get("nexttrack")?.({ action: "nexttrack" }));

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(initialTime);
    expect(commandFetches()).toHaveLength(0);
  });

  it("waits for source-replacement acknowledgement and preserves the room query", async () => {
    let acknowledge!: (accepted: boolean) => void;
    const room = {
      ...controller(true),
      prepareSourceReplacement: vi.fn(
        () => new Promise<boolean>((resolve) => { acknowledge = resolve; })
      ),
    };
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
    expect(room.prepareSourceReplacement).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    acknowledge(true);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `/app/watch/42?room=${room.roomId}&quality=720p-4&transcode=1`,
        { replace: true }
      )
    );
  });

  it("never calls play from canplay while the room snapshot is paused", () => {
    const room = controller(true, {
      ...baseSnapshot,
      phase: "paused",
      anchor: { positionMs: 0, effectiveAtMs: 0, rate: 1 },
    });
    renderPlayer(room);
    fireEvent.canPlay(screen.getByLabelText("Video player: Example"));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("does not scrobble when a room seek jumps to 95 percent and ended fires", async () => {
    const room = controller(false);
    renderPlayer(room);
    const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
    fireEvent.canPlay(video);
    vi.mocked(fetch).mockClear();
    video.currentTime = 95;
    fireEvent.seeking(video);
    fireEvent.timeUpdate(video);
    fireEvent.ended(video);
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/plex/scrobble")
    ).toHaveLength(0);
  });
});