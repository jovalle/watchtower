import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getRoomCoordinator } from "~/lib/rooms/coordinator.server";
import { prepareRoomPost, requireMethod, roomError, roomJson } from "~/lib/rooms/http.server";
import { parsePresence } from "~/lib/rooms/protocol";

export async function action({ request, params }: ActionFunctionArgs) {
  const prepared = await prepareRoomPost(request, parsePresence);
  if (!prepared.ok) return prepared.response;
  if (!params.roomId) return roomError("not_found", "Room not found.", prepared.setCookie);
  return roomJson(await getRoomCoordinator().presence(prepared.principal, params.roomId, prepared.value), prepared.setCookie);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return requireMethod(request, "POST");
}