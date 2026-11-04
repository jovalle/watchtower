import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Users } from "lucide-react";
import { useContainedTab } from "~/hooks/useContainedTab";
import { Button, buttonStyles } from "~/components/ui";
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

  // Collapse while playing so the panel stays out of the picture; reopen when the room needs attention.
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
    <aside aria-label="Watch Together" className="flex max-w-full flex-col items-end gap-2 text-foreground-primary">
      <div className="flex max-w-[calc(100vw-7rem)] flex-wrap items-center justify-end gap-2">
        <div aria-live="polite" className="min-w-0 max-w-full break-words rounded-md bg-black/80 px-2 py-1 text-right text-sm text-white">
          {status}
        </div>
        {countdownSeconds !== null && (
          <div className="flex max-w-full flex-wrap items-center gap-1 rounded-md bg-background-elevated px-3 text-sm">
            Next episode in <span aria-hidden="true">{countdownSeconds}s</span>
            <span className="sr-only">a few seconds</span>
            {controller.isHost && (
              <Button type="button" variant="ghost" size="sm" className="ml-2"
                onClick={() => void controller.sendIntent({ type: "cancel-next", payload: {} })}>
                Cancel
              </Button>
            )}
          </div>
        )}
        {!self?.ready && controller.status === "connected" && (
          <Button type="button" onClick={onReady}>
            {self?.error === "autoplay_blocked" ? "Tap to Start Playback" : "I'm Ready"}
          </Button>
        )}
        <Button type="button" variant="ghost" className="gap-2 bg-background-elevated"
          onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label="Watch Together">
          <Users className="h-5 w-5" />
          <span>Watch Together</span>
          <span aria-hidden="true">{snapshot.participants.length}</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="w-[min(24rem,calc(100vw-2rem))] max-w-full rounded-lg border border-border-emphasis bg-background-elevated p-3 shadow-xl">
          <p className="truncate text-sm font-semibold">{title}</p>

          <ul className="mt-3 space-y-2" aria-label="Room members">
            {snapshot.participants.map((participant) => (
              <li
                key={participant.participantId}
                className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border-subtle py-2 text-sm last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">
                  {participant.displayName}
                  {participant.participantId === snapshot.hostParticipantId
                    ? " (Host)"
                    : ""}
                </span>
                <span className="text-foreground-secondary">
                  {participantStatus(participant)}
                  {participant.blocking && participant.buffering
                    ? " - blocking"
                    : ""}
                </span>
                {controller.isHost &&
                  participant.participantId !== controller.participantId && (
                    <span className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="ghost" size="sm"
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
                      </Button>
                      <Button
                        type="button"
                        variant="ghost" size="sm"
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
                      </Button>
                    </span>
                  )}
              </li>
            ))}
          </ul>

          {removedMember && controller.isHost && invitation && (
            <div className="mt-3 rounded-md border border-border-emphasis p-3 text-sm">
              <span>Member removed.</span>
              <Button
                type="button"
                variant="ghost" size="sm" className="ml-2"
                onClick={() => {
                  setRemovedMember(false);
                  onInvitation("rotate");
                }}
              >
                Also Rotate Invite Link
              </Button>
            </div>
          )}

          {controller.isHost &&
            (snapshot.phase === "lobby" || snapshot.phase === "paused") && (
              <Button
                type="button"
                disabled={controller.status !== "connected" || !blockersReady}
                onClick={() =>
                  void controller.sendIntent({ type: "play", payload: {} })
                }
                variant="secondary" className="mt-3 w-full"
              >
                Start
              </Button>
            )}

          {controller.isHost && invitation && (
            <section className="mt-4 border-t border-border-subtle pt-3">
              <label htmlFor="room-invite" className="text-sm font-semibold">
                Invite link
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="room-invite"
                  readOnly
                  value={inviteUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-border-emphasis bg-background-secondary px-3 text-sm text-foreground-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
                <Button
                  type="button"
                  onClick={copyInvite}
                  variant="secondary" size="sm"
                  aria-label="Copy Invite Link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-1 text-xs text-foreground-secondary">
                {copied ? "Copied." : "Expires "}
                {!copied && `in ${inviteMinutes} min`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => onInvitation("rotate")}
                  variant="secondary" size="sm" className="flex-1"
                >
                  Rotate
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => onInvitation("revoke")}
                  variant="secondary" size="sm" className="flex-1"
                >
                  Revoke
                </Button>
              </div>
            </section>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border-subtle pt-3">
            <Button
              type="button"
              onClick={onLeave}
              variant="secondary" size="sm"
            >
              Leave
            </Button>
            <Button
              type="button"
              onClick={onContinueSolo}
              variant="secondary" size="sm"
            >
              Continue Solo
            </Button>
            {controller.isHost && (
              <Button
                type="button"
                onClick={() =>
                  void controller.sendIntent({ type: "end", payload: {} })
                }
                variant="secondary" size="sm" className="col-span-2 !border-red-400/50 !text-red-200"
              >
                End Room
              </Button>
            )}
          </div>

          <details className="mt-4 border-t border-border-subtle pt-3 text-xs text-foreground-secondary">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold text-foreground-secondary">
              Room Details
            </summary>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 break-words font-mono">
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useContainedTab(dialogRef);
  useEffect(() => buttonRef.current?.focus(), []);
  return (
    <div ref={dialogRef} className="absolute inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/85 p-4" role="alertdialog" aria-modal="true" aria-labelledby="takeover-title">
      <div className="my-auto max-w-md break-words rounded-lg border border-border-emphasis bg-background-elevated p-6 text-foreground-primary shadow-2xl">
        <h2 id="takeover-title" className="text-lg font-semibold">Room Already Open</h2>
        <p className="mt-2 text-sm text-foreground-secondary">This room is open in another tab or window on this device.</p>
        <button ref={buttonRef} type="button" disabled={pending} onClick={onTakeover} className={buttonStyles({ className: "mt-5 w-full" })}>Take Over Here</button>
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useContainedTab(dialogRef);
  useEffect(() => messageRef.current?.focus(), []);
  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="room-terminal-message"
      className="absolute inset-0 z-[65] flex items-center justify-center overflow-y-auto bg-black/85 p-6 text-center text-white"
    >
      <div className="my-auto w-full max-w-lg break-words">
        <h2
          id="room-terminal-message"
          ref={messageRef}
          tabIndex={-1}
          className="text-lg font-semibold"
        >
          {message}
        </h2>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button
            type="button"
            onClick={onContinueSolo}
          >
            Continue Solo
          </Button>
          <Button
            type="button"
            onClick={onBack}
            variant="secondary"
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
