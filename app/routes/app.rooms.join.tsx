import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { Container, PageHeader } from "~/components/layout";
import { Button } from "~/components/ui";
import { joinRoom, RoomApiError } from "~/lib/rooms/client";

const pendingJoins = new Map<string, ReturnType<typeof joinRoom>>();

function joinInvite(invite: string) {
  const pending = pendingJoins.get(invite);
  if (pending) return pending;
  const request = joinRoom({ invite });
  pendingJoins.set(invite, request);
  const clear = () => {
    if (pendingJoins.get(invite) === request) pendingJoins.delete(invite);
  };
  void request.then(clear, clear);
  return request;
}

function joinError(error: unknown) {
  if (!(error instanceof RoomApiError)) {
    return "The room could not be reached. Check your connection and try again.";
  }
  switch (error.code) {
    case "invalid_request":
    case "not_found":
    case "request_expired":
    case "room_ended":
      return "This invite is invalid or expired. Ask the host for a new link.";
    case "media_forbidden":
      return "Your Plex profile does not have access to this title.";
    case "capacity_exceeded":
      return "This room is full.";
    case "rate_limited":
      return "Too many join attempts. Wait a moment and try again.";
    case "feature_disabled":
      return "Watch Together is currently disabled.";
    default:
      return error.message;
  }
}

export default function JoinRoomPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const startedInviteRef = useRef<string | null>(null);

  useEffect(() => {
    const invite = sessionStorage.getItem("wt:invite");
    if (!invite) {
      setError("No invitation was found. Open the link the host shared with you.");
      return;
    }
    if (startedInviteRef.current === invite) return;
    startedInviteRef.current = invite;
    void joinInvite(invite)
      .then((envelope) => {
        sessionStorage.setItem(
          `wt:member:${envelope.snapshot.roomId}`,
          String(envelope.membership.membershipVersion)
        );
        navigate(
          `/app/watch/${encodeURIComponent(envelope.snapshot.media.ratingKey)}?room=${encodeURIComponent(envelope.snapshot.roomId)}`,
          { replace: true }
        );
      })
      .catch((reason) => {
        setError(joinError(reason));
      })
      .finally(() => {
        if (sessionStorage.getItem("wt:invite") === invite) {
          sessionStorage.removeItem("wt:invite");
        }
      });
  }, [navigate]);

  return (
    <Container size="wide" className="pb-16 pt-8">
      <PageHeader title="Join Room" />
      <div className="max-w-md">
        <p className="text-foreground-secondary" role="status">
          {error ?? "Joining the room..."}
        </p>
        {error && (
          <Button
            variant="secondary"
            type="button"
            onClick={() => navigate("/app", { replace: true })}
            className="mt-5"
          >
            Return Home
          </Button>
        )}
      </div>
    </Container>
  );
}