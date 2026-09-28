import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getRoomCoordinator } from "~/lib/rooms/coordinator.server";
import { authenticateRoomRequest, requireMethod, roomJson } from "~/lib/rooms/http.server";
import { PROTOCOL_VERSION } from "~/lib/rooms/protocol";

export async function loader({ request }: LoaderFunctionArgs) {
  const coordinator = getRoomCoordinator();
  const receivedAtMs = coordinator.now();
  const methodError = requireMethod(request, "GET");
  if (methodError) return methodError;
  const auth = await authenticateRoomRequest(request);
  if (!auth.ok) return auth.response;
  return roomJson({
    status: 200,
    body: {
      protocolVersion: PROTOCOL_VERSION,
      epoch: coordinator.epoch,
      receivedAtMs,
      sentAtMs: coordinator.now(),
    },
  }, auth.setCookie);
}

export async function action({ request }: ActionFunctionArgs) {
  return requireMethod(request, "GET");
}