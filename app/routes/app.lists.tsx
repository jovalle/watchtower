/**
 * Lists page - Shows user's playlists and library collections.
 * GET /app/lists
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { ListVideo, FolderOpen, Film, Tv } from "lucide-react";
import { Container } from "~/components/layout";
import { Typography } from "~/components/ui";
import { requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import type { PlexPlaylist } from "~/lib/plex/types";

export const meta: MetaFunction = () => {
  return [
    { title: "Lists | Watchtower" },
    { name: "description", content: "Your playlists and collections" },
  ];
};

interface ListCardData {
  ratingKey: string;
  title: string;
  itemCount: number;
  thumb: string | null;
  type: "playlist" | "collection";
  subtype?: "movie" | "show";
}

interface LoaderData {
  playlists: ListCardData[];
  collections: ListCardData[];
  serverUrl: string;
  token: string;
}

function buildImageUrl(
  path: string | undefined | null,
  width: number = 300,
  height: number = 450
): string | null {
  if (!path) return null;
  return `/api/plex/image?path=${encodeURIComponent(path)}&width=${width}&height=${height}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requirePlexToken(request);

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  // Fetch playlists
  const playlistsResult = await client.getPlaylists();
  const playlists: ListCardData[] = playlistsResult.success
    ? playlistsResult.data.map((p: PlexPlaylist) => ({
        ratingKey: p.ratingKey,
        title: p.title,
        itemCount: p.leafCount,
        thumb: buildImageUrl(p.composite, 300, 300),
        type: "playlist" as const,
      }))
    : [];

  // Fetch collections from all video libraries
  const librariesResult = await client.getLibraries();
  const collections: ListCardData[] = [];

  if (librariesResult.success) {
    for (const library of librariesResult.data) {
      if (library.type === "movie" || library.type === "show") {
        const collectionsResult = await client.getCollections(library.key);
        if (collectionsResult.success) {
          for (const c of collectionsResult.data) {
            collections.push({
              ratingKey: c.ratingKey,
              title: c.title,
              itemCount: c.childCount,
              thumb: buildImageUrl(c.thumb, 300, 450),
              type: "collection",
              subtype: c.subtype,
            });
          }
        }
      }
    }
  }

  return json<LoaderData>({
    playlists,
    collections,
    serverUrl: env.PLEX_SERVER_URL,
    token,
  });
}

function ListCard({ item }: { item: ListCardData }) {
  return (
    <Link
      to={`/app/lists/${item.type}/${item.ratingKey}`}
      className="group relative"
    >
      {/* Card with aspect ratio */}
      <div className="relative aspect-square overflow-hidden rounded-lg bg-background-elevated shadow-lg ring-1 ring-white/10 transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:ring-2 group-hover:ring-white/30">
        {/* Thumbnail or placeholder */}
        {item.thumb ? (
          <img
            src={item.thumb}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-background-elevated to-background-primary">
            {item.type === "playlist" ? (
              <ListVideo className="h-12 w-12 text-foreground-muted" />
            ) : item.subtype === "movie" ? (
              <Film className="h-12 w-12 text-foreground-muted" />
            ) : (
              <Tv className="h-12 w-12 text-foreground-muted" />
            )}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Title and count */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-white drop-shadow-lg">
            {item.title}
          </h3>
          <span className="text-xs text-white/70">
            {item.itemCount} {item.itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Type badge */}
        <div className="absolute right-2 top-2">
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-xs capitalize text-white/90">
            {item.type}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ListsPage() {
  const { playlists, collections } = useLoaderData<typeof loader>();
  const totalItems = playlists.length + collections.length;

  return (
    <Container size="wide" className="py-8">
      <Typography variant="title" as="h1" className="mb-8">
        Lists
      </Typography>

      {totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="mb-4 h-16 w-16 text-foreground-muted" />
          <Typography variant="subtitle" className="mb-2">
            No lists found
          </Typography>
          <Typography variant="body" className="max-w-md text-foreground-secondary">
            Create playlists or collections in Plex to organize your media.
            They&apos;ll appear here for easy access.
          </Typography>
        </div>
      ) : (
        <>
          {/* Playlists Section */}
          {playlists.length > 0 && (
            <div className="mb-10">
              <div className="mb-4 flex items-center gap-2">
                <ListVideo className="h-5 w-5 text-foreground-secondary" />
                <Typography variant="subtitle">Your Playlists</Typography>
                <span className="text-sm text-foreground-muted">
                  ({playlists.length})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {playlists.map((playlist) => (
                  <ListCard key={playlist.ratingKey} item={playlist} />
                ))}
              </div>
            </div>
          )}

          {/* Collections Section */}
          {collections.length > 0 && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-foreground-secondary" />
                <Typography variant="subtitle">Collections</Typography>
                <span className="text-sm text-foreground-muted">
                  ({collections.length})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {collections.map((collection) => (
                  <ListCard key={collection.ratingKey} item={collection} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
