import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixtures from "../../fixtures/rooms/v1/fixtures.json";
import type { RoomClientState } from "~/lib/rooms/client";
import type { RoomEnvelope } from "~/lib/rooms/protocol";

const navigate = vi.hoisted(() => vi.fn());
const leaveClient = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recoverRoom = vi.hoisted(() => vi.fn());
const emitters = vi.hoisted(() => [] as Array<(state: RoomClientState) => void>);

vi.mock("@remix-run/react", () => ({ useNavigate: () => navigate }));
vi.mock("~/lib/rooms/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/lib/rooms/client")>();
  class TestRoomClient {
    readonly roomId: string;
    private readonly state: RoomClientState;

    constructor(roomId: string, envelope: RoomEnvelope) {
      this.roomId = roomId;
      this.state = {
        status: "connected",
        snapshot: envelope.snapshot,
        membership: envelope.membership,
        invitation: envelope.invitation,
        clock: null,
        endedReason: null,
        lastErrorCode: null,
        reconnects: 0,
      };
    }

    subscribe(listener: (state: RoomClientState) => void) {
      emitters.push(listener);
      listener(this.state);
      return () => {};
    }

    start() {
      return Promise.resolve();
    }

    stop() {}

    leave() {
      return leaveClient();
    }

    getState() {
      return this.state;
    }

    observePresence() {}
  }

  return {
    ...original,
    BrowserRoomClient: TestRoomClient,
    recoverRoom,
  };
});

import { useWatchRoom } from "~/hooks/useWatchRoom";

const envelope = structuredClone(fixtures.createResponse) as RoomEnvelope;
const baseOptions = {
  roomId: envelope.snapshot.roomId,
  together: false,
  watchTogetherEnabled: true,
  ratingKey: "42",
  mediaId: "7",
  partId: "9",
  partCount: 1,
  title: "Example",
  resumePositionMs: 0,
  autoAdvance: true,
};

beforeEach(() => {
  navigate.mockReset();
  leaveClient.mockClear();
  recoverRoom.mockReset().mockResolvedValue(structuredClone(envelope));
  sessionStorage.clear();
  sessionStorage.setItem(
    `wt:member:${envelope.snapshot.roomId}`,
    String(envelope.membership.membershipVersion)
  );
});

afterEach(cleanup);

it("keeps playback armed across next-episode option changes and clears it on leave", async () => {
  const view = renderHook(
    ({ ratingKey }) => useWatchRoom({ ...baseOptions, ratingKey }),
    { initialProps: { ratingKey: "42" } }
  );
  await waitFor(() => expect(view.result.current.controller).not.toBeNull());

  act(() => view.result.current.controller?.setPlaybackArmed(true));
  expect(view.result.current.controller?.playbackArmed).toBe(true);
  view.rerender({ ratingKey: "43" });
  expect(view.result.current.controller?.playbackArmed).toBe(true);

  await act(async () => view.result.current.leave());
  expect(view.result.current.controller).toBeNull();
});

it("replaces a stale notice with the terminal reason when the live connection fails", async () => {
  const view = renderHook(() => useWatchRoom(baseOptions));
  await waitFor(() => expect(view.result.current.controller).not.toBeNull());
  act(() => view.result.current.controller?.explainHostOnly());
  act(() => view.result.current.controller?.setPlaybackArmed(true));
  expect(view.result.current.message).toBe("Only the host controls playback.");

  const current = view.result.current.state;
  act(() => emitters.at(-1)?.({ ...current, status: "error", lastErrorCode: "not_found" }));

  expect(view.result.current.message).toBe("The room is no longer available.");
  expect(view.result.current.controller?.playbackArmed).toBe(false);
});

it("continues from the last local position after terminal without leaving", async () => {
  const view = renderHook(() => useWatchRoom(baseOptions));
  await waitFor(() => expect(view.result.current.controller).not.toBeNull());
  act(() => {
    view.result.current.controller?.observePresence({
      playbackSessionId: null,
      positionMs: 12_345.6,
      ready: false,
      buffering: false,
      replacingSource: false,
      error: null,
    });
  });

  act(() => view.result.current.continueSoloFromTerminal());

  expect(leaveClient).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith("/app/watch/42?t=12346", {
    replace: true,
  });
});