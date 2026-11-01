import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getRoomCoordinator } from "~/lib/rooms/coordinator.server";
import { prepareRoomPost, requireMethod, roomJson } from "~/lib/rooms/http.server";
import { parseCreateRoom } from "~/lib/rooms/protocol";

export async function action({ request }: ActionFunctionArgs) {
  const prepared = await prepareRoomPost(request, parseCreateRoom);
  if (!prepared.ok) return prepared.response;
  return roomJson(await getRoomCoordinator().create(prepared.principal, prepared.value), prepared.setCookie);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return requireMethod(request, "POST");
}