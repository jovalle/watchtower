import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getRoomCoordinator } from "~/lib/rooms/coordinator.server";
import { authenticateRoomRequest, requireMethod, roomError, roomJson } from "~/lib/rooms/http.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const methodError = requireMethod(request, "GET");
  if (methodError) return methodError;
  const auth = await authenticateRoomRequest(request);
  if (!auth.ok) return auth.response;
  if (!params.roomId) return roomError("not_found", "Room not found.", auth.setCookie);
  return roomJson(getRoomCoordinator().get(auth.principal, params.roomId), auth.setCookie);
}

export async function action({ request }: ActionFunctionArgs) {
  return requireMethod(request, "GET");
}