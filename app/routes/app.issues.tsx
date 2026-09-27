import {
  json,
  redirect,
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
import { seerrForUser, type SeerrTitle } from "~/lib/integrations/seerr.server";
import {
  listParams,
  mediaTitles,
  positiveId,
} from "~/lib/integrations/seerr-pages.server";
import {
  actionClass,
  controlClass,
  ListFilter,
  Pagination,
  SeerrError,
  SeerrPage,
} from "~/components/seerr/SeerrPage";

export const meta = () => [{ title: "Issues | Watchtower" }];
const filters = ["all", "open", "resolved"];
export const issueTypes: Record<number, string> = {
  1: "Video",
  2: "Audio",
  3: "Subtitles",
  4: "Other",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const { page, filter } = listParams(request, filters);
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 200);
  try {
    const { client, userId } = await seerrForUser(user.id);
    const type = params.get("type");
    const selected =
      (type === "movie" || type === "tv") && params.has("tmdbId")
        ? await client.getTitle(type, positiveId(params.get("tmdbId")), userId)
        : null;
    const [data, search] = await Promise.all([
      client.getIssues(userId, page, filter),
      q
        ? client.search(q, userId)
        : Promise.resolve({ results: [] as SeerrTitle[] }),
    ]);
    return json({
      items: await mediaTitles(client, userId, data.results),
      pages: data.pageInfo.pages,
      page,
      filter,
      q,
      selected,
      matches: search.results.filter(
        (item) =>
          (item.mediaType === "movie" || item.mediaType === "tv") &&
          item.mediaInfo
      ),
      error: null as string | null,
    });
  } catch (error) {
    return json({
      items: [],
      pages: 0,
      page,
      filter,
      q,
      selected: null,
      matches: [],
      error: error instanceof Error ? error.message : "Couldn't load issues.",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, { status: 405 });
  try {
    const data = await request.formData();
    const mediaId = positiveId(data.get("mediaId"));
    const issueType = Number(data.get("issueType"));
    const message = String(data.get("message") || "").trim();
    if (!issueTypes[issueType] || !message || message.length > 5000)
      return json(
        {
          error:
            "Choose an issue type and describe the problem (up to 5,000 characters).",
        },
        { status: 400 }
      );
    const { client, userId } = await seerrForUser(user.id);
    const issue = await client.createIssue(mediaId, issueType, message, userId);
    return redirect(`/app/issues/${issue.id}`);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Couldn't report this issue.",
      },
      { status: 400 }
    );
  }
}

export default function IssuesPage() {
  const { items, pages, page, filter, q, selected, matches, error } =
    useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <SeerrPage
      title="Issues"
      description="Report a problem with a title and follow up with your server administrator."
    >
      {error && <SeerrError error={error} />}
      {!error && (
        <>
          <section className="mb-8 rounded-lg border border-border-subtle bg-background-secondary p-5">
            <h2 className="mb-4 text-lg font-semibold">Report an issue</h2>
            <Form method="get" className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                Find a movie or series
                <input
                  name="q"
                  defaultValue={q}
                  required
                  maxLength={200}
                  className={controlClass}
                />
              </label>
              <button className={controlClass}>Search</button>
            </Form>
            {q && !matches.length && (
              <p className="mt-4 text-sm text-foreground-secondary">
                No tracked titles found. Try another title.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {matches.map((item) => (
                <Link
                  key={`${item.mediaType}-${item.id}`}
                  to={`?type=${item.mediaType}&tmdbId=${item.id}`}
                  className={controlClass}
                >
                  {item.title || item.name}
                </Link>
              ))}
            </div>
            {selected?.mediaInfo && (
              <Form method="post" className="mt-5 space-y-4">
                <h3 className="font-medium">
                  {selected.title || selected.name}
                </h3>
                <input
                  type="hidden"
                  name="mediaId"
                  value={selected.mediaInfo.id}
                />
                <label className="flex flex-col gap-2 text-sm">
                  Problem
                  <select name="issueType" className={controlClass}>
                    {Object.entries(issueTypes).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  Description
                  <textarea
                    name="message"
                    required
                    maxLength={5000}
                    rows={3}
                    placeholder="What went wrong? For series, include the season and episode."
                    className={controlClass}
                  />
                </label>
                <button
                  disabled={navigation.state !== "idle"}
                  className={actionClass}
                >
                  {navigation.state === "submitting"
                    ? "Reporting…"
                    : "Report issue"}
                </button>
              </Form>
            )}
            {selected && !selected.mediaInfo && (
              <p className="mt-4">
                This title is not tracked by your server yet.
              </p>
            )}
            {result?.error && (
              <p role="alert" className="mt-3 text-red-400">
                {result.error}
              </p>
            )}
          </section>
          <ListFilter value={filter} options={filters} />
          {!items.length && (
            <p className="py-8 text-foreground-secondary">
              No issues match this filter.
            </p>
          )}
          <div className="space-y-3">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/app/issues/${item.id}`}
                className="flex items-center gap-4 rounded-lg border border-border-subtle bg-background-secondary p-4 hover:border-border-emphasis"
              >
                {item.posterUrl && (
                  <img
                    src={item.posterUrl}
                    alt=""
                    className="h-24 w-16 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    {issueTypes[item.issueType] || "Other"} ·{" "}
                    {item.createdAt.slice(0, 10)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-foreground-secondary">
                    {item.comments[0]?.message}
                  </p>
                </div>
                <span className="text-sm text-accent-primary">
                  {item.status === 2 ? "Resolved" : "Open"}
                </span>
              </Link>
            ))}
          </div>
          <Pagination page={page} pages={pages} />
        </>
      )}
    </SeerrPage>
  );
}
