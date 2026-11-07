import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { requireUser } from "~/lib/auth/user.server";
import { requireServerToken } from "~/lib/auth/session.server";
import { requestInbox } from "~/lib/integrations/notifications.server";
import { Container, PageHeader } from "~/components/layout";
import { buttonStyles } from "~/components/ui/Button";
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
  const result = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const controlClass = buttonStyles({ variant: "secondary", size: "sm" });
  return (
    <Container size="wide" className="pb-16 pt-8">
      <div aria-busy={busy}>
        <PageHeader title="Notifications" actions={
          <Form method="post">
            <button name="id" value="all" disabled={busy || notifications.every((item) => item.read)} className={controlClass}>
              Mark All Read
            </button>
          </Form>
        } />
        <div className="space-y-6">
          {error && <p role="alert" className="break-words text-red-400">{error}</p>}
          {result?.error && <p role="alert" className="break-words text-red-400">{result.error}</p>}
          {limited && <p>Checking your 200 most recent requests. Older requests remain available on the Requests page.</p>}
          {!error && !notifications.length && <p className="text-foreground-secondary">No updates yet. Changes to your requests will appear here while you use Watchtower.</p>}
          <ul className="space-y-3">
            {notifications.map((item) => (
              <li key={item.id} className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 ${item.read ? "border-border-subtle" : "border-accent-primary"}`}>
                <Link to={item.href} className="min-h-11 min-w-0 flex-1 break-words">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p>{item.state}{!item.read ? " · Unread" : ""}</p>
                  <time className="text-sm text-foreground-secondary" dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleDateString()}</time>
                </Link>
                {!item.read && <Form method="post"><button name="id" value={item.id} disabled={busy} className={controlClass}>Mark Read</button></Form>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Container>
  );
}
