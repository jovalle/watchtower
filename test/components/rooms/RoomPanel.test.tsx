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
  expect(screen.getByText("Loading")).toBeInTheDocument();
  expect(screen.getByText("Ready")).toBeInTheDocument();
  expect(screen.getByText("Buffering - blocking")).toBeInTheDocument();
  expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Room details"));
  expect(screen.getByText(snapshot.roomId.slice(0, 8))).toBeInTheDocument();
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
  const continueButton = screen.getByRole("button", { name: "Continue solo" });
  const backButton = screen.getByRole("button", { name: "Back" });
  expect(continueButton.tabIndex).toBe(0);
  expect(backButton.tabIndex).toBe(0);
  fireEvent.click(continueButton);
  fireEvent.click(backButton);
  expect(onContinueSolo).toHaveBeenCalledOnce();
  expect(onBack).toHaveBeenCalledOnce();
});