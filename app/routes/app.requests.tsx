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
import { requestState } from "~/lib/integrations/request-state";
import {
  listParams,
  mediaTitles,
  positiveId,
} from "~/lib/integrations/seerr-pages.server";
import {
  controlClass,
  ListFilter,
  Pagination,
  SeerrError,
  SeerrPage,
} from "~/components/seerr/SeerrPage";

export const meta = () => [{ title: "Requests | Watchtower" }];
const filters = ["all", "pending", "processing", "available", "failed"];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const { page, filter } = listParams(request, filters);
  try {
    const { client, userId } = await seerrForUser(user.id);
    const data = await client.getRequests(userId, page, filter);
    return json({
      items: await mediaTitles(client, userId, data.results),
      pages: data.pageInfo.pages,
      page,
      filter,
      error: null as string | null,
    });
  } catch (error) {
    return json({
      items: [],
      pages: 0,
      page,
      filter,
      error: error instanceof Error ? error.message : "Couldn't load requests.",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, { status: 405 });
  try {
    const data = await request.formData();
    if (data.get("intent") !== "cancel")
      return json({ error: "Invalid action" }, { status: 400 });
    const id = positiveId(data.get("id"));
    const { client, userId } = await seerrForUser(user.id);
    await client.cancelRequest(id, userId);
    return json({ error: null });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Couldn't cancel this request.",
      },
      { status: 400 }
    );
  }
}

export default function RequestsPage() {
  const { items, pages, page, filter, error } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <SeerrPage
      title="Requests"
      description="Track the movies and series you’ve asked for."
    >
      <ListFilter value={filter} options={filters} />
      {error && <SeerrError error={error} />}
      {result?.error && (
        <p role="alert" className="mb-4 text-red-400">
          {result.error}
        </p>
      )}
      {!error && !items.length && (
        <div className="rounded-lg border border-border-subtle p-8">
          <h2 className="text-lg font-medium">No requests here yet</h2>
          <Link
            to="/app/discover"
            className="mt-3 inline-block text-accent-primary"
          >
            Discover something to request →
          </Link>
        </div>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="flex flex-wrap items-center gap-4 rounded-lg border border-border-subtle bg-background-secondary p-4"
          >
            {item.posterUrl && (
              <img
                src={item.posterUrl}
                alt=""
                className="h-24 w-16 rounded object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold"><Link to={`/app/media/${item.media.mediaType === "tv" ? "show" : "movie"}/tmdb-${item.media.tmdbId}`}>{item.title}</Link></h2>
              <p className="mt-1 text-sm text-foreground-secondary">
                {item.media.mediaType === "tv" ? "Series" : "Movie"}
                {item.is4k ? " · 4K" : ""} · {item.createdAt.slice(0, 10)}
              </p>
              {!!item.seasons?.length && (
                <p className="text-sm text-foreground-secondary">
                  Seasons{" "}
                  {item.seasons.map((season) => season.seasonNumber).join(", ")}
                </p>
              )}
              <p className="mt-2 text-sm text-accent-primary">
                {requestState(item)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.status === 1 && (
                <Form method="post">
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    name="intent"
                    value="cancel"
                    disabled={navigation.state !== "idle"}
                    className={controlClass}
                  >
                    Cancel request
                  </button>
                </Form>
              )}
              <Link
                to={`/app/issues?type=${item.media.mediaType}&tmdbId=${item.media.tmdbId}`}
                className={controlClass}
              >
                Report issue
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!error && <Pagination page={page} pages={pages} />}
    </SeerrPage>
  );
}
