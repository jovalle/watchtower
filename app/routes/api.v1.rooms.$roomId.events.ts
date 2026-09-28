import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getRoomCoordinator } from "~/lib/rooms/coordinator.server";
import { authenticateRoomRequest, requireMethod, roomError, roomJson } from "~/lib/rooms/http.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const methodError = requireMethod(request, "GET");
  if (methodError) return methodError;
  const auth = await authenticateRoomRequest(request);
  if (!auth.ok) return auth.response;
  if (!params.roomId) return roomError("not_found", "Room not found.", auth.setCookie);
  const result = getRoomCoordinator().subscribe(auth.principal, params.roomId, request);
  if (result.status !== 200 || !(result.body instanceof ReadableStream)) return roomJson(result, auth.setCookie);
  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    "Referrer-Policy": "no-referrer",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  });
  if (auth.setCookie) headers.append("Set-Cookie", auth.setCookie);
  return new Response(result.body, { status: 200, headers });
}

export async function action({ request }: ActionFunctionArgs) {
  return requireMethod(request, "GET");
}