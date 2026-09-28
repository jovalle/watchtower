import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSession } from "~/lib/auth/session.server";
import { getRoomCoordinator } from "~/lib/rooms/coordinator.server";
import { authenticateRoomRequest, requireMethod, roomError, roomJson } from "~/lib/rooms/http.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const methodError = requireMethod(request, "GET");
  if (methodError) return methodError;
  const auth = await authenticateRoomRequest(request);
  if (!auth.ok) return auth.response;
  const session = await getSession(request);
  if (session.get("isOwner") !== true) return roomError("forbidden", "Only the server owner can view room diagnostics.", auth.setCookie);
  return roomJson({ status: 200, body: getRoomCoordinator().diagnostics() }, auth.setCookie);
}

export async function action({ request }: ActionFunctionArgs) {
  return requireMethod(request, "GET");
}