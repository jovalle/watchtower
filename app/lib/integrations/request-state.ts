import type { SeerrRequest, SeerrMedia } from "./seerr.server";

export function requestState(item: Pick<SeerrRequest, "status" | "media" | "is4k">): string {
  const media = item.is4k ? item.media.status4k : item.media.status;
  if (media === 6) return "Blocked";
  if (item.status === 3) return "Declined";
  if (item.status === 4) return "Failed";
  if (media === 7) return "Deleted from library";
  if (media === 4) return "Partially available";
  if (media === 5) return "Available";
  if (item.status === 1) return "Awaiting approval";
  if (media === 3) return "Processing";
  if (item.status === 2) return "Approved";
  if (item.status === 5) return "Completed; library availability pending";
  return "Unknown";
}

/** Only expose the current viewer's request decisions, even if upstream permits broader access. */
export function titleRequestStates(media: SeerrMedia | undefined, userId: number) {
  return (media?.requests ?? []).filter((request) => request.requestedBy?.id === userId)
    .sort((a, b) => b.id - a.id)
    .map((request) => ({ id: request.id, is4k: request.is4k, state: requestState({ ...request, media: media! }) }));
}
