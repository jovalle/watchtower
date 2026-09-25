import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { requireUser } from "~/lib/auth/user.server";
import { seerrForUser } from "~/lib/integrations/seerr.server";
import { mediaTitles, positiveId } from "~/lib/integrations/seerr-pages.server";
import {
  actionClass,
  controlClass,
  SeerrError,
  SeerrPage,
} from "~/components/seerr/SeerrPage";

export const meta = () => [{ title: "Issue | Watchtower" }];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  try {
    const id = positiveId(params.id);
    const { client, userId } = await seerrForUser(user.id);
    const issue = await client.getIssue(id, userId);
    const [item] = await mediaTitles(client, userId, [issue]);
    return json({
      item: { ...item, canEdit: issue.createdBy.id === userId },
      error: null as string | null,
    });
  } catch (error) {
    return json({
      item: null,
      error: error instanceof Error ? error.message : "Couldn't load issue.",
    });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireUser(request);
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, { status: 405 });
  try {
    const id = positiveId(params.id);
    const data = await request.formData();
    const intent = data.get("intent");
    const message = String(data.get("message") || "").trim();
    if (intent !== "comment" && intent !== "open" && intent !== "resolved")
      return json({ error: "Invalid action" }, { status: 400 });
    if (intent === "comment" && (!message || message.length > 5000))
      return json(
        { error: "Enter a comment of up to 5,000 characters." },
        { status: 400 }
      );
    const { client, userId } = await seerrForUser(user.id);
    await client.updateIssue(id, userId, intent, message);
    return json({ error: null });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Couldn't update issue.",
      },
      { status: 400 }
    );
  }
}

export default function IssuePage() {
  const { item, error } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <SeerrPage
      title={item?.title || "Issue"}
      description={
        item
          ? `Issue #${item.id} · ${item.status === 2 ? "Resolved" : "Open"}`
          : "Issue details"
      }
    >
      <Link to="/app/issues" className="text-accent-primary">
        ← All issues
      </Link>
      {error && <SeerrError error={error} />}
      {item && (
        <div className="mt-6 max-w-3xl">
          {item.canEdit && (
            <Form method="post" className="mb-6">
              <button
                name="intent"
                value={item.status === 2 ? "open" : "resolved"}
                disabled={navigation.state !== "idle"}
                className={controlClass}
              >
                {item.status === 2 ? "Reopen issue" : "Mark resolved"}
              </button>
            </Form>
          )}
          <ol className="space-y-4">
            {item.comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-border-subtle bg-background-secondary p-5"
              >
                <p className="mb-2 text-sm text-foreground-secondary">
                  {comment.user?.displayName ||
                    comment.user?.username ||
                    "Member"}{" "}
                  · {comment.createdAt.slice(0, 10)}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {comment.message}
                </p>
              </li>
            ))}
          </ol>
          {item.canEdit && (
            <Form
              method="post"
              key={item.comments.length}
              className="mt-6 space-y-3"
            >
              <label className="flex flex-col gap-2 text-sm">
                Add a comment
                <textarea
                  name="message"
                  rows={4}
                  required
                  maxLength={5000}
                  className={controlClass}
                />
              </label>
              <button
                name="intent"
                value="comment"
                disabled={navigation.state !== "idle"}
                className={actionClass}
              >
                {navigation.state === "submitting" ? "Saving…" : "Post comment"}
              </button>
            </Form>
          )}
          {result?.error && (
            <p role="alert" className="mt-3 text-red-400">
              {result.error}
            </p>
          )}
        </div>
      )}
    </SeerrPage>
  );
}
