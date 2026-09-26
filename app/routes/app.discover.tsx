import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigate } from "@remix-run/react";
import { Container } from "~/components/layout";
import { MediaRow } from "~/components/media/MediaRow";
import { SeerrError } from "~/components/seerr/SeerrPage";
import { getUserSettings } from "~/lib/settings/storage.server";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/lib/auth/user.server";
import { seerrForUser, type SeerrTitle } from "~/lib/integrations/seerr.server";

export const meta = () => [{ title: "Discover | Watchtower" }];
const feeds = [
  ["Trending", "trending"],
  ["Popular movies", "movies"],
  ["Popular series", "tv"],
  ["Upcoming movies", "movies/upcoming"],
  ["Upcoming series", "tv/upcoming"],
] as const;
const statuses: Record<number, string> = {
  2: "Requested",
  3: "Processing",
  4: "Partially available",
  5: "Available",
  6: "Blocked",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  if ((await getUserSettings(user.id))?.preferences.discoveryDisabled) throw redirect("/app/watch");
  try {
    const { client, userId } = await seerrForUser(user.id);
    const rows = await Promise.all(
      feeds.map(async ([title, feed]) => {
        try {
          const data = await client.discover(feed, userId);
          return {
            title,
            items: data.results.filter(
              (item) => item.mediaType === "movie" || item.mediaType === "tv"
            ),
            error: null as string | null,
          };
        } catch {
          return {
            title,
            items: [] as SeerrTitle[],
            error: `Couldn't load ${title.toLowerCase()}.`,
          };
        }
      })
    );
    return json({ rows, error: null as string | null });
  } catch (error) {
    return json({
      rows: [],
      error: error instanceof Error ? error.message : "Couldn't load Discover.",
    });
  }
}

export default function DiscoverPage() {
  const { rows, error } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <Container size="wide" className="space-y-10 pb-16 pt-8">
      <h1 className="text-3xl font-bold">Discover</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-foreground-secondary">
          Find your next watch. Request something new.
        </p>
        <Link to="/app/search" className="text-accent-primary">
          Search movies and series →
        </Link>
      </div>
      {error && <SeerrError error={error} />}
      {rows.map((row) => (
        <section key={row.title}>
          {row.error ? (
            <SeerrError error={row.error} />
          ) : row.items.length ? (
            <MediaRow title={row.title}>
              {row.items.map((item) => {
                const title = item.title || item.name || "Untitled";
                const year = (
                  item.releaseDate ||
                  item.firstAirDate ||
                  ""
                ).slice(0, 4);
                const posterUrl = item.posterPath
                  ? `https://image.tmdb.org/t/p/w342${item.posterPath}`
                  : null;
                return (
                  <button
                    key={`${item.mediaType}-${item.id}`}
                    onClick={() =>
                      navigate(`/app/media/${item.mediaType === "tv" ? "show" : "movie"}/tmdb-${item.id}`)
                    }
                    className="w-36 shrink-0 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary sm:w-44"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-background-elevated">
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center p-4 text-foreground-secondary">
                          {title}
                        </span>
                      )}
                      {item.mediaInfo && statuses[item.mediaInfo.status] && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/85 px-2 py-1.5 text-center text-xs text-white">
                          {statuses[item.mediaInfo.status]}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 truncate text-sm font-medium">
                      {title}
                    </h3>
                    <p className="mt-1 text-xs text-foreground-secondary">
                      {year} · {item.mediaType === "tv" ? "Series" : "Movie"}
                    </p>
                  </button>
                );
              })}
            </MediaRow>
          ) : (
            <p className="text-foreground-secondary">
              No titles in {row.title.toLowerCase()} yet.
            </p>
          )}
        </section>
      ))}

    </Container>
  );
}
