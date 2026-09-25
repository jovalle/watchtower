import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { requireUser } from "~/lib/auth/user.server";
import { requireServerToken } from "~/lib/auth/session.server";
import { requestInbox } from "~/lib/integrations/notifications.server";
import { Container } from "~/components/layout";
export { action } from "./api.notifications";
export const meta = () => [{ title: "Notifications | Watchtower" }];
export async function loader({ request }: LoaderFunctionArgs) {
  await requireServerToken(request);
  const user = await requireUser(request);
  const { notifications, error, limited } = await requestInbox(user.id);
  return json({ notifications, error, limited }, { headers: { "Cache-Control": "private, no-store" } });
}
export default function Notifications() {
  const { notifications, error, limited } = useLoaderData<typeof loader>();
  return <Container className="space-y-6 py-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">Notifications</h1><Form method="post"><button name="id" value="all" className="min-h-11 rounded-md border border-border-subtle px-4">Mark all read</button></Form></div>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {limited && <p>Checking your 200 most recent requests. Older requests remain available on the Requests page.</p>}
    {!notifications.length && <p className="text-foreground-secondary">No updates yet. Changes to your requests will appear here while you use Watchtower.</p>}
    <ul className="space-y-3">{notifications.map((item) => <li key={item.id} className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 ${item.read ? "border-border-subtle" : "border-accent-primary"}`}>
      <Link to={item.href} className="min-h-11 flex-1"><h2 className="font-semibold">{item.title}</h2><p>{item.state}{!item.read ? " · Unread" : ""}</p><time className="text-sm text-foreground-secondary" dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleDateString()}</time></Link>
      {!item.read && <Form method="post"><button name="id" value={item.id} className="min-h-11 rounded-md border border-border-subtle px-4">Mark read</button></Form>}
    </li>)}</ul>
  </Container>;
}
