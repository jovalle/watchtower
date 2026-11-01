import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@remix-run/react";
import {
  BrowserRoomClient,
  RoomApiError,
  createRoom,
  joinRoom,
  recoverRoom,
  type PresenceInput,
  type RoomClientState,
} from "~/lib/rooms/client";
import type {
  RoomCommand,
  RoomEnvelope,
  RoomSnapshot,
} from "~/lib/rooms/protocol";

const SOURCE_REPLACEMENT_ACK_MS = 4000;

export type WatchRoomController = {
  roomId: string;
  status: RoomClientState["status"];
  snapshot: RoomSnapshot;
  participantId: string;
  isHost: boolean;
  clockOffsetMs: number;
  clockRttMs: number | null;
  clockUncertaintyMs: number | null;
  readyRequest: number;
  playbackArmed: boolean;
  message: string | null;
  sendIntent(command: RoomCommand): Promise<boolean>;
  reportPresence(input: PresenceInput): Promise<boolean>;
  observePresence(input: PresenceInput): void;
  prepareSourceReplacement(input: {
    playbackSessionId: string | null;
    positionMs: number | null;
  }): Promise<boolean>;
  setPlaybackArmed(armed: boolean): void;
  explainHostOnly(): void;
};

export type UseWatchRoomOptions = {
  roomId: string | null;
  together: boolean;
  watchTogetherEnabled: boolean;
  ratingKey: string;
  mediaId: string;
  partId: string | null;
  partCount: number;
  title: string;
  resumePositionMs: number;
  autoAdvance: boolean;
};

export type RoomPlayerDiagnostics = {
  driftMs: number;
  hardSeeks: number;
  rateCorrections: number;
};

const initialClientState: RoomClientState = {
  status: "idle",
  snapshot: null,
  membership: null,
  invitation: null,
  clock: null,
  endedReason: null,
  lastErrorCode: null,
  reconnects: 0,
};

function markerKey(roomId: string) {
  return `wt:member:${roomId}`;
}

function storeMembership(envelope: RoomEnvelope) {
  sessionStorage.setItem(
    markerKey(envelope.snapshot.roomId),
    String(envelope.membership.membershipVersion)
  );
}

function messageForCode(code: string | null): string | null {
  switch (code) {
    case "media_forbidden":
      return "Your Plex profile cannot access this title.";
    case "capacity_exceeded":
      return "This room is full.";
    case "rate_limited":
      return "Too many attempts. Wait a moment and try again.";
    case "feature_disabled":
      return "Watch Together is currently disabled.";
    case "room_ended":
    case "membership_ended":
      return "This room has ended.";
    case "removed":
      return "The host removed you from this room.";
    case "not_host":
      return "Only the host controls playback.";
    case "unauthenticated":
    case "server_changed":
    case "identity_ambiguous":
      return "Your sign-in changed. Sign in again to rejoin the room.";
    default:
      return null;
  }
}

function friendlyError(error: unknown): string {
  if (!(error instanceof RoomApiError)) return "The room could not be reached.";
  return messageForCode(error.code) ?? error.message;
}

export function useWatchRoom(options: UseWatchRoomOptions) {
  const navigate = useNavigate();
  const clientRef = useRef<BrowserRoomClient | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const pageHidingRef = useRef(false);
  const createRequestIdRef = useRef<string | null>(null);
  const createPendingRef = useRef(false);
  const observedPositionRef = useRef(0);
  const [clientState, setClientState] = useState(initialClientState);
  const [takeoverEnvelope, setTakeoverEnvelope] = useState<RoomEnvelope | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [readyRequest, setReadyRequest] = useState(0);
  const [playbackArmed, setPlaybackArmed] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RoomPlayerDiagnostics>({
    driftMs: 0,
    hardSeeks: 0,
    rateCorrections: 0,
  });

  const attach = useCallback((envelope: RoomEnvelope) => {
    detachRef.current?.();
    const client = new BrowserRoomClient(envelope.snapshot.roomId, envelope);
    clientRef.current = client;
    const unsubscribe = client.subscribe(setClientState);
    void client.start();
    const detach = () => {
      unsubscribe();
      if (pageHidingRef.current) client.stop();
      else void client.leave().catch(() => client.stop());
      if (clientRef.current === client) clientRef.current = null;
    };
    detachRef.current = detach;
    return detach;
  }, []);

  useEffect(() => {
    const onPageHide = () => {
      pageHidingRef.current = true;
    };
    const onPageShow = () => {
      pageHidingRef.current = false;
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!options.roomId || !options.watchTogetherEnabled) return;
    let cancelled = false;
    let detach: (() => void) | undefined;
    setClientState({ ...initialClientState, status: "connecting" });
    void recoverRoom(options.roomId)
      .then((envelope) => {
        if (cancelled) return;
        const marker = sessionStorage.getItem(markerKey(options.roomId!));
        if (marker !== String(envelope.membership.membershipVersion)) {
          setTakeoverEnvelope(envelope);
          setClientState({
            ...initialClientState,
            status: "idle",
            snapshot: envelope.snapshot,
            membership: envelope.membership,
          });
          return;
        }
        detach = attach(envelope);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(friendlyError(error));
          setClientState({ ...initialClientState, status: "error" });
        }
      });
    return () => {
      cancelled = true;
      if (detach && detachRef.current === detach) {
        detach();
        detachRef.current = null;
      }
    };
  }, [attach, options.roomId, options.watchTogetherEnabled]);

  useEffect(
    () => () => {
      detachRef.current?.();
      detachRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (clientState.status === "ended") setPlaybackArmed(false);
    // A live connection that fails terminally replaces any stale transient notice.
    if (clientState.status === "error" && clientState.lastErrorCode) {
      setPlaybackArmed(false);
      setMessage(
        messageForCode(clientState.lastErrorCode) ??
          "The room is no longer available."
      );
    }
  }, [clientState.status, clientState.lastErrorCode]);

  const submitCreate = useCallback(
    async (startPositionMs: number) => {
      if (createPendingRef.current || !options.partId) return;
      createPendingRef.current = true;
      setPending(true);
      setMessage(null);
      createRequestIdRef.current ??= crypto.randomUUID();
      try {
        const envelope = await createRoom(
          {
            media: {
              ratingKey: options.ratingKey,
              mediaId: options.mediaId,
              partId: options.partId,
            },
            startPositionMs,
            autoAdvance: options.autoAdvance,
          },
          { requestId: createRequestIdRef.current }
        );
        storeMembership(envelope);
        navigate(
          `/app/watch/${encodeURIComponent(options.ratingKey)}?room=${encodeURIComponent(envelope.snapshot.roomId)}`,
          { replace: true }
        );
      } catch (error) {
        setMessage(friendlyError(error));
      } finally {
        createPendingRef.current = false;
        setPending(false);
      }
    },
    [navigate, options]
  );

  const takeover = useCallback(async () => {
    if (!takeoverEnvelope || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const envelope = await joinRoom({
        roomId: takeoverEnvelope.snapshot.roomId,
        takeover: true,
      });
      storeMembership(envelope);
      setTakeoverEnvelope(null);
      attach(envelope);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setPending(false);
    }
  }, [attach, pending, takeoverEnvelope]);

  const sendIntent = useCallback(async (command: RoomCommand) => {
    const client = clientRef.current;
    const state = client?.getState();
    if (!client || state?.status !== "connected") {
      setMessage("Room connection is unavailable. Playback is paused.");
      return false;
    }
    if (state.snapshot?.hostParticipantId !== state.membership?.participantId) {
      setMessage("Only the host controls playback.");
      return false;
    }
    const accepted = await client.sendCommand(command).catch((error) => {
      setMessage(friendlyError(error));
      return false;
    });
    if (!accepted && client.getState().lastErrorCode) {
      setMessage(
        messageForCode(client.getState().lastErrorCode) ??
          "The room changed before that action. Try again."
      );
    }
    return accepted;
  }, []);

  const reportPresence = useCallback((input: PresenceInput) => {
    if (input.positionMs !== null) observedPositionRef.current = input.positionMs;
    const client = clientRef.current;
    if (!client) return Promise.resolve(false);
    return client.reportPresence(input).catch((error) => {
      setMessage(friendlyError(error));
      return false;
    });
  }, []);

  const observePresence = useCallback((input: PresenceInput) => {
    if (input.positionMs !== null) observedPositionRef.current = input.positionMs;
    clientRef.current?.observePresence(input);
  }, []);

  const prepareSourceReplacement = useCallback(
    async (input: {
      playbackSessionId: string | null;
      positionMs: number | null;
    }) => {
      const client = clientRef.current;
      if (!client) return false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const acknowledged = await Promise.race([
        client.prepareSourceReplacement(input),
        new Promise<false>((resolve) => {
          timeout = setTimeout(() => resolve(false), SOURCE_REPLACEMENT_ACK_MS);
        }),
      ]).catch(() => false);
      if (timeout) clearTimeout(timeout);
      if (!acknowledged) {
        setMessage("Room connection is unavailable. The stream was not changed.");
      }
      return acknowledged;
    },
    []
  );

  const leave = useCallback(async () => {
    const roomId = clientRef.current?.roomId ?? options.roomId;
    await clientRef.current?.leave().catch(() => {});
    clientRef.current = null;
    if (roomId) sessionStorage.removeItem(markerKey(roomId));
    setClientState({
      ...initialClientState,
      status: "ended",
      endedReason: "left",
    });
    setPlaybackArmed(false);
    setMessage("You left the room. Playback is stopped.");
  }, [options.roomId]);

  const navigateSolo = useCallback(() => {
    navigate(
      `/app/watch/${encodeURIComponent(options.ratingKey)}?t=${Math.max(0, Math.round(observedPositionRef.current))}`,
      { replace: true }
    );
  }, [navigate, options.ratingKey]);

  const continueSolo = useCallback(async () => {
    await leave();
    navigateSolo();
  }, [leave, navigateSolo]);

  const updateInvitation = useCallback(async (action: "rotate" | "revoke") => {
    setPending(true);
    try {
      await clientRef.current?.updateInvitation(action);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setPending(false);
    }
  }, []);

  const reportDiagnostics = useCallback(
    (update: { driftMs: number; correction: "seek" | "rate" | null }) => {
      setDiagnostics((current) => ({
        driftMs: Math.round(update.driftMs),
        hardSeeks: current.hardSeeks + (update.correction === "seek" ? 1 : 0),
        rateCorrections:
          current.rateCorrections + (update.correction === "rate" ? 1 : 0),
      }));
    },
    []
  );

  const controller = useMemo<WatchRoomController | null>(() => {
    const snapshot = clientState.snapshot;
    const membership = clientState.membership;
    if (!options.roomId || !snapshot || !membership || takeoverEnvelope) return null;
    return {
      roomId: options.roomId,
      status: clientState.status,
      snapshot,
      participantId: membership.participantId,
      isHost: snapshot.hostParticipantId === membership.participantId,
      clockOffsetMs: clientState.clock?.offsetMs ?? 0,
      clockRttMs: clientState.clock?.rttMs ?? null,
      clockUncertaintyMs: clientState.clock?.uncertaintyMs ?? null,
      readyRequest,
      playbackArmed,
      message,
      sendIntent,
      reportPresence,
      observePresence,
      prepareSourceReplacement,
      setPlaybackArmed,
      explainHostOnly: () => setMessage("Only the host controls playback."),
    };
  }, [
    clientState,
    message,
    options.roomId,
    playbackArmed,
    prepareSourceReplacement,
    readyRequest,
    reportPresence,
    observePresence,
    sendIntent,
    takeoverEnvelope,
  ]);

  return {
    controller,
    state: clientState,
    pending,
    message,
    showCreateDialog:
      options.together && !options.roomId && options.watchTogetherEnabled,
    createDisabled: options.partCount !== 1 || !options.partId,
    createDisabledReason:
      options.partCount !== 1
        ? "Watch Together does not yet support multipart titles."
        : null,
    takeoverRequired: takeoverEnvelope !== null,
    submitCreate,
    cancelCreate: () => navigate(`/app/watch/${encodeURIComponent(options.ratingKey)}`, { replace: true }),
    takeover,
    requestReady: () => setReadyRequest((value) => value + 1),
    sendIntent,
    leave,
    continueSolo,
    continueSoloFromTerminal: navigateSolo,
    updateInvitation,
    diagnostics,
    reportDiagnostics,
  };
}