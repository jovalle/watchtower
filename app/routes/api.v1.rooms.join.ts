import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getRoomCoordinator } from "~/lib/rooms/coordinator.server";
import { prepareRoomPost, requireMethod, roomJson } from "~/lib/rooms/http.server";
import { parseJoinRoom } from "~/lib/rooms/protocol";

export async function action({ request }: ActionFunctionArgs) {
  const prepared = await prepareRoomPost(request, parseJoinRoom);
  if (!prepared.ok) return prepared.response;
  return roomJson(await getRoomCoordinator().join(prepared.principal, prepared.value), prepared.setCookie);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return requireMethod(request, "POST");
}