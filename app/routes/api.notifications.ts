import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/lib/auth/user.server";
import { requireServerToken } from "~/lib/auth/session.server";
import { requestInbox } from "~/lib/integrations/notifications.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireServerToken(request);
  const user = await requireUser(request);
  const inbox = await requestInbox(user.id);
  return json({ unread: inbox.notifications.filter((item) => !item.read).length }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function action({ request }: ActionFunctionArgs) {
  await requireServerToken(request);
  const user = await requireUser(request);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.formData();
  const id = body.get("id");
  if (typeof id !== "string" || !id || id.length > 150) return json({ error: "Invalid notification" }, { status: 400 });
  const inbox = await requestInbox(user.id, id);
  return json({ unread: inbox.notifications.filter((item) => !item.read).length }, { headers: { "Cache-Control": "private, no-store" } });
}
