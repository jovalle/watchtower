import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Container } from "~/components/layout";
import WatchNavigation from "~/components/library/WatchNavigation";
import { MediaRow } from "~/components/media";
import { requireServerToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { buildPosterUrl } from "~/lib/plex/images";
import { env } from "~/lib/env.server";

export const meta = () => [{ title: "New in library | Watchtower" }];
export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const client = new PlexClient({ serverUrl: env.PLEX_SERVER_URL, token, clientId: env.PLEX_CLIENT_ID });
  const result = await client.getRecentlyAdded(undefined, 100);
  const items = result.success ? result.data.filter((item) => ["movie", "show", "episode"].includes(item.type)) : [];
  return json({
    items: items.map((item) => ({ ratingKey: item.ratingKey, type: item.type, title: item.type === "episode" ? `${item.grandparentTitle} · S${item.parentIndex}:E${item.index}` : item.title, poster: buildPosterUrl(item.type === "episode" ? item.grandparentThumb : item.thumb), score: item.audienceRating ?? 0 })),
    error: result.success ? null : "Couldn't load recently added titles. Try refreshing this page.",
  });
}
export default function RecentLibrary() {
  const { items, error } = useLoaderData<typeof loader>();
  const ranked = [...items].filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
  return <><WatchNavigation /><Container size="wide" className="py-8">
    {error && <p role="alert">{error}</p>}
    {!error && !items.length && <p>No recently added titles yet.</p>}
    {[{ title: "Recently added", entries: items }, { title: "Highest rated recent additions", entries: ranked }].map(({title, entries}) => (
      <MediaRow key={title} title={title} items={entries} getKey={(item) => item.ratingKey} renderItem={(item) => <Link to={`/app/media/${item.type}/${item.ratingKey}`} className="block w-36 sm:w-44"><img src={item.poster} alt="" className="aspect-[2/3] w-full rounded-md object-cover" loading="lazy" /><p className="mt-2 truncate">{item.title}</p></Link>} />
    ))}
  </Container></>;
}
