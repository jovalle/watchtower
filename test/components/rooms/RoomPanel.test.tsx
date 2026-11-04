import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RoomPanel, RoomTerminal } from "~/components/rooms";
import type { WatchRoomController } from "~/hooks/useWatchRoom";
import fixtures from "../../fixtures/rooms/v1/fixtures.json";
import type { RoomSnapshot } from "~/lib/rooms/protocol";

const snapshot = structuredClone(fixtures.playingSnapshot) as RoomSnapshot;

it("distinguishes loading, ready, buffering and reconnecting members", () => {
  const controller: WatchRoomController = {
    roomId: snapshot.roomId,
    status: "connected",
    snapshot: {
      ...snapshot,
      participants: [
        { ...snapshot.participants[0], ready: false, buffering: false },
        { ...snapshot.participants[1], ready: true, buffering: false },
        { ...snapshot.participants[1], participantId: "44444444-4444-4444-8444-444444444444", displayName: "Buffer", ready: false, buffering: true },
        { ...snapshot.participants[1], participantId: "55555555-5555-4555-8555-555555555555", displayName: "Offline", connected: false, ready: false },
      ],
    },
    participantId: snapshot.participants[0].participantId,
    isHost: true,
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
  render(
    <RoomPanel
      controller={controller}
      title="Example"
      invitation={null}
      pending={false}
      message={null}
      reconnects={2}
      diagnostics={{ driftMs: 125, hardSeeks: 1, rateCorrections: 2 }}
      lastErrorCode={null}
      onReady={() => {}}
      onLeave={() => {}}
      onContinueSolo={() => {}}
      onInvitation={() => {}}
    />
  );
  const toggle = screen.getByRole("button", { name: "Watch Together" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  expect(screen.getByText("Room is playing.")).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByText("Loading")).toBeInTheDocument();
  expect(screen.getByText("Ready")).toBeInTheDocument();
  expect(screen.getByText("Buffering - blocking")).toBeInTheDocument();
  expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Room Details"));
  expect(screen.getByText(snapshot.roomId.slice(0, 8))).toBeInTheDocument();
});

it("collapses while playing, keeps the countdown visible, and reopens when paused", () => {
  const panel = (roomSnapshot: RoomSnapshot) => {
    const controller: WatchRoomController = {
      roomId: roomSnapshot.roomId,
      status: "connected",
      snapshot: roomSnapshot,
      participantId: roomSnapshot.participants[0].participantId,
      isHost: true,
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
    return (
      <RoomPanel
        controller={controller}
        title="Example"
        invitation={null}
        pending={false}
        message={null}
        reconnects={0}
        diagnostics={{ driftMs: 0, hardSeeks: 0, rateCorrections: 0 }}
        lastErrorCode={null}
        onReady={() => {}}
        onLeave={() => {}}
        onContinueSolo={() => {}}
        onInvitation={() => {}}
      />
    );
  };
  const playing: RoomSnapshot = {
    ...snapshot,
    nextCountdown: { deadlineMs: performance.now() + 10_000 },
  };
  const { rerender } = render(panel(playing));

  const toggle = screen.getByRole("button", { name: "Watch Together" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("list", { name: "Room members" })).not.toBeInTheDocument();
  expect(screen.getByText("Next episode in")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

  // A late joiner must reach its ready gesture without expanding the panel.
  rerender(
    panel({
      ...playing,
      participants: playing.participants.map((participant, index) =>
        index === 0 ? { ...participant, ready: false } : participant
      ),
    })
  );
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: "I'm Ready" })).toBeInTheDocument();

  rerender(panel({ ...playing, phase: "paused", nextCountdown: null }));
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("list", { name: "Room members" })).toBeInTheDocument();
  expect(screen.getByText("Room is paused.")).toBeInTheDocument();
});

it("focuses a terminal message and exposes keyboard-reachable exit actions", () => {
  const onContinueSolo = vi.fn();
  const onBack = vi.fn();
  render(
    <RoomTerminal
      message="This room has ended."
      onContinueSolo={onContinueSolo}
      onBack={onBack}
    />
  );

  expect(screen.getByRole("heading", { name: "This room has ended." })).toHaveFocus();
  const continueButton = screen.getByRole("button", { name: "Continue Solo" });
  const backButton = screen.getByRole("button", { name: "Back" });
  expect(continueButton.tabIndex).toBe(0);
  expect(backButton.tabIndex).toBe(0);
  fireEvent.click(continueButton);
  fireEvent.click(backButton);
  expect(onContinueSolo).toHaveBeenCalledOnce();
  expect(onBack).toHaveBeenCalledOnce();

  // Modal: Tab wraps inside the overlay instead of reaching covered player controls.
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  backButton.focus();
  fireEvent.keyDown(backButton, { key: "Tab" });
  expect(continueButton).toHaveFocus();
  screen.getByRole("heading", { name: "This room has ended." }).focus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(backButton).toHaveFocus();
});