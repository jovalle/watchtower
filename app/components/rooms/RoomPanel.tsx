import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Users } from "lucide-react";
import type { RoomClientState } from "~/lib/rooms/client";
import type {
  RoomPlayerDiagnostics,
  WatchRoomController,
} from "~/hooks/useWatchRoom";

type RoomPanelProps = {
  controller: WatchRoomController;
  title: string;
  invitation: RoomClientState["invitation"];
  pending: boolean;
  message: string | null;
  reconnects: number;
  diagnostics: RoomPlayerDiagnostics;
  lastErrorCode: string | null;
  onReady(): void;
  onLeave(): void;
  onContinueSolo(): void;
  onInvitation(action: "rotate" | "revoke"): void;
};

function participantStatus(
  participant: WatchRoomController["snapshot"]["participants"][number]
) {
  if (!participant.connected) return "Reconnecting";
  if (participant.error === "autoplay_blocked") return "Autoplay blocked";
  if (participant.error) return "Error";
  if (participant.buffering) return "Buffering";
  if (participant.ready) return "Ready";
  return "Loading";
}

export function RoomPanel({
  controller,
  title,
  invitation,
  pending,
  message,
  reconnects,
  diagnostics,
  lastErrorCode,
  onReady,
  onLeave,
  onContinueSolo,
  onInvitation,
}: RoomPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [removedMember, setRemovedMember] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const snapshot = controller.snapshot;
  const self = snapshot.participants.find(
    (participant) => participant.participantId === controller.participantId
  );
  const inviteUrl = useMemo(
    () =>
      invitation
        ? `${location.origin}/join#i=${invitation.secret}`
        : "",
    [invitation]
  );
  const countdownSeconds = snapshot.nextCountdown
    ? Math.max(
        0,
        Math.ceil(
          (snapshot.nextCountdown.deadlineMs -
            (now + controller.clockOffsetMs)) /
            1000
        )
      )
    : null;
  const inviteMinutes = invitation
    ? Math.max(
        0,
        Math.ceil(
          (invitation.expiresAtMs - (now + controller.clockOffsetMs)) / 60_000
        )
      )
    : null;
  const blockersReady = snapshot.participants
    .filter((participant) => participant.blocking)
    .every((participant) => participant.ready);

  useEffect(() => {
    if (!snapshot.nextCountdown) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [snapshot.nextCountdown]);

  // Collapse while playing so the panel never sits over player menus; reopen when the room needs attention.
  useEffect(() => {
    setExpanded(snapshot.phase !== "playing");
  }, [snapshot.phase]);

  const status =
    controller.status === "reconnecting"
      ? "Reconnecting. Playback is paused."
      : message ??
        (snapshot.phase === "lobby"
          ? "Waiting for everyone to get ready."
          : `Room is ${snapshot.phase}.`);

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="absolute left-3 top-16 z-[60] w-[min(24rem,calc(100vw-1.5rem))] rounded-md border border-white/20 bg-black/90 text-white shadow-xl">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
        aria-expanded={expanded}
      >
        <Users className="h-5 w-5" />
        <span className="flex-1 font-semibold">Watch Together</span>
        {expanded ? (
          <ChevronUp className="h-5 w-5" />
        ) : (
          <ChevronDown className="h-5 w-5" />
        )}
      </button>
      <div aria-live="polite" className="min-h-5 px-3 pb-2 text-sm text-white/80">
        {status}
      </div>

      {countdownSeconds !== null && (
        <div className="mx-3 mb-3 rounded border border-mango/40 bg-mango/10 p-3 text-sm">
          Next episode in <span aria-hidden="true">{countdownSeconds}s</span>
          <span className="sr-only">a few seconds</span>
          {controller.isHost && (
            <button
              type="button"
              className="ml-3 min-h-11 underline"
              onClick={() =>
                void controller.sendIntent({
                  type: "cancel-next",
                  payload: {},
                })
              }
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {!self?.ready && controller.status === "connected" && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onReady}
            className="min-h-11 w-full rounded bg-mango px-3 font-semibold text-black"
          >
            {self?.error === "autoplay_blocked"
              ? "Tap to start playback"
              : "I'm ready"}
          </button>
        </div>
      )}

      {expanded && (
        <div className="max-h-[calc(100vh-18rem)] overflow-y-auto border-t border-white/10 p-3">
          <p className="truncate text-sm font-semibold">{title}</p>

          <ul className="mt-3 space-y-2" aria-label="Room members">
            {snapshot.participants.map((participant) => (
              <li
                key={participant.participantId}
                className="flex min-h-11 items-center gap-2 border-b border-white/10 py-2 text-sm last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">
                  {participant.displayName}
                  {participant.participantId === snapshot.hostParticipantId
                    ? " (Host)"
                    : ""}
                </span>
                <span className="text-white/60">
                  {participantStatus(participant)}
                  {participant.blocking && participant.buffering
                    ? " - blocking"
                    : ""}
                </span>
                {controller.isHost &&
                  participant.participantId !== controller.participantId && (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className="min-h-11 px-2 text-xs underline"
                        onClick={() =>
                          void controller.sendIntent({
                            type: "transfer-host",
                            payload: {
                              participantId: participant.participantId,
                            },
                          })
                        }
                      >
                        Transfer
                      </button>
                      <button
                        type="button"
                        className="min-h-11 px-2 text-xs underline"
                        onClick={() => {
                          void controller.sendIntent({
                            type: "remove-participant",
                            payload: {
                              participantId: participant.participantId,
                            },
                          }).then((accepted) => setRemovedMember(accepted));
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  )}
              </li>
            ))}
          </ul>

          {removedMember && controller.isHost && invitation && (
            <div className="mt-3 rounded border border-white/20 p-3 text-sm">
              <span>Member removed.</span>
              <button
                type="button"
                className="ml-2 min-h-11 underline"
                onClick={() => {
                  setRemovedMember(false);
                  onInvitation("rotate");
                }}
              >
                Also rotate invite link
              </button>
            </div>
          )}

          {controller.isHost &&
            (snapshot.phase === "lobby" || snapshot.phase === "paused") && (
              <button
                type="button"
                disabled={controller.status !== "connected" || !blockersReady}
                onClick={() =>
                  void controller.sendIntent({ type: "play", payload: {} })
                }
                className="mt-3 min-h-11 w-full rounded border border-white/30 px-3 font-semibold disabled:opacity-50"
              >
                Start
              </button>
            )}

          {controller.isHost && invitation && (
            <section className="mt-4 border-t border-white/10 pt-3">
              <label htmlFor="room-invite" className="text-sm font-semibold">
                Invite link
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="room-invite"
                  readOnly
                  value={inviteUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded border border-white/30 bg-white/5 px-2 text-xs"
                />
                <button
                  type="button"
                  onClick={copyInvite}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded border border-white/30"
                  aria-label="Copy invite link"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-white/50">
                {copied ? "Copied." : "Expires "}
                {!copied && `in ${inviteMinutes} min`}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onInvitation("rotate")}
                  className="min-h-11 flex-1 rounded border border-white/30 px-2 text-sm"
                >
                  Rotate
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onInvitation("revoke")}
                  className="min-h-11 flex-1 rounded border border-white/30 px-2 text-sm"
                >
                  Revoke
                </button>
              </div>
            </section>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={onLeave}
              className="min-h-11 rounded border border-white/30 px-3 text-sm"
            >
              Leave
            </button>
            <button
              type="button"
              onClick={onContinueSolo}
              className="min-h-11 rounded border border-white/30 px-3 text-sm"
            >
              Continue solo
            </button>
            {controller.isHost && (
              <button
                type="button"
                onClick={() =>
                  void controller.sendIntent({ type: "end", payload: {} })
                }
                className="col-span-2 min-h-11 rounded border border-red-400/50 px-3 text-sm text-red-200"
              >
                End room
              </button>
            )}
          </div>

          <details className="mt-4 border-t border-white/10 pt-3 text-xs text-white/60">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold text-white/80">
              Room details
            </summary>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono">
              <dt>Room</dt><dd>{snapshot.roomId.slice(0, 8)}</dd>
              <dt>Epoch</dt><dd>{snapshot.epoch.slice(0, 8)}</dd>
              <dt>Revision</dt><dd>{snapshot.revision}/{snapshot.presenceRevision}</dd>
              <dt>Phase</dt><dd>{snapshot.phase}</dd>
              <dt>Reason</dt><dd>{snapshot.reason ?? "none"}</dd>
              <dt>Drift</dt><dd>{diagnostics.driftMs} ms</dd>
              <dt>RTT / uncertainty</dt><dd>{controller.clockRttMs === null ? "pending" : `${Math.round(controller.clockRttMs)} / ${Math.round(controller.clockUncertaintyMs ?? 0)} ms`}</dd>
              <dt>Hard seeks</dt><dd>{diagnostics.hardSeeks}</dd>
              <dt>Rate corrections</dt><dd>{diagnostics.rateCorrections}</dd>
              <dt>Reconnects</dt><dd>{reconnects}</dd>
              <dt>Last error</dt><dd>{lastErrorCode ?? "none"}</dd>
            </dl>
          </details>
        </div>
      )}
    </aside>
  );
}

export function RoomTakeover({ pending, onTakeover }: { pending: boolean; onTakeover(): void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => buttonRef.current?.focus(), []);
  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" role="alertdialog" aria-labelledby="takeover-title">
      <div className="max-w-md rounded-md border border-white/20 bg-black p-6 text-white">
        <h2 id="takeover-title" className="text-lg font-semibold">Room already open</h2>
        <p className="mt-2 text-sm text-white/70">This room is open in another tab or window on this device.</p>
        <button ref={buttonRef} type="button" disabled={pending} onClick={onTakeover} className="mt-5 min-h-11 w-full rounded bg-mango px-4 font-semibold text-black disabled:opacity-50">Take over here</button>
      </div>
    </div>
  );
}

export function RoomTerminal({
  message,
  onContinueSolo,
  onBack,
}: {
  message: string;
  onContinueSolo(): void;
  onBack(): void;
}) {
  const messageRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => messageRef.current?.focus(), []);
  return (
    <div
      role="alertdialog"
      aria-labelledby="room-terminal-message"
      className="absolute inset-0 z-[65] flex items-center justify-center bg-black/85 p-6 text-center text-white"
    >
      <div>
        <h2
          id="room-terminal-message"
          ref={messageRef}
          tabIndex={-1}
          className="text-lg font-semibold"
        >
          {message}
        </h2>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={onContinueSolo}
            className="min-h-11 rounded bg-mango px-4 font-semibold text-black"
          >
            Continue solo
          </button>
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 rounded border border-white/30 px-4"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}