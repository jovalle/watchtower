/**
 * List detail page - Shows items in a playlist or collection.
 * GET /app/lists/:type/:ratingKey
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, Link } from "@remix-run/react";
import { ArrowLeft } from "lucide-react";
import { Container } from "~/components/layout";
import { PosterCard } from "~/components/media/PosterCard";
import { Typography } from "~/components/ui";
import { requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import type { PlexMediaItem } from "~/lib/plex/types";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data?.title ?? "List Details";
  return [
    { title: `${title} | Watchtower` },
    { name: "description", content: `Browse items in ${title}` },
  ];
};

interface ListItem {
  ratingKey: string;
  title: string;
  year?: number;
  type: string;
  posterUrl: string;
  backdropUrl: string;
  viewCount: number;
  leafCount?: number;
  viewedLeafCount?: number;
  // For tooltip details
  summary?: string;
  duration?: number;
  contentRating?: string;
  audienceRating?: number;
  genres?: string[];
}

interface LoaderData {
  title: string;
  summary?: string;
  itemCount: number;
  items: ListItem[];
  listType: "playlist" | "collection";
  serverUrl: string;
  token: string;
}

function buildImageUrl(
  serverUrl: string,
  token: string,
  path: string | undefined,
  width: number = 300,
  height: number = 450
): string {
  if (!path) return "";
  return `${serverUrl}/photo/:/transcode?width=${width}&height=${height}&minSize=1&upscale=1&url=${encodeURIComponent(path)}&X-Plex-Token=${token}`;
}

function formatRuntime(durationMs?: number): string | undefined {
  if (!durationMs) return undefined;
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${remainingMinutes}m`;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requirePlexToken(request);
  const { type, ratingKey } = params;

  // Validate type parameter
  if (type !== "playlist" && type !== "collection") {
    throw new Response("Invalid list type", { status: 400 });
  }

  // Validate ratingKey
  if (!ratingKey) {
    throw new Response("Missing rating key", { status: 400 });
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  let title = "List";
  let summary: string | undefined;
  let items: PlexMediaItem[] = [];

  if (type === "playlist") {
    // Get playlist items
    const itemsResult = await client.getPlaylistItems(ratingKey);
    if (itemsResult.success) {
      items = itemsResult.data;
    }

    // Get playlist metadata for title
    const playlistsResult = await client.getPlaylists();
    if (playlistsResult.success) {
      const playlist = playlistsResult.data.find((p) => p.ratingKey === ratingKey);
      if (playlist) {
        title = playlist.title;
        summary = playlist.summary;
      }
    }
  } else {
    // Get collection items
    const itemsResult = await client.getCollectionItems(ratingKey);
    if (itemsResult.success) {
      items = itemsResult.data;
    }

    // Get collection metadata for title - need to search all libraries
    const librariesResult = await client.getLibraries();
    if (librariesResult.success) {
      for (const library of librariesResult.data) {
        if (library.type === "movie" || library.type === "show") {
          const collectionsResult = await client.getCollections(library.key);
          if (collectionsResult.success) {
            const collection = collectionsResult.data.find((c) => c.ratingKey === ratingKey);
            if (collection) {
              title = collection.title;
              summary = collection.summary;
              break;
            }
          }
        }
      }
    }
  }

  // Process items: keep movies and shows, deduplicate episodes/seasons into their parent shows
  // This handles collections that contain individual episodes instead of show entries
  const directItems: PlexMediaItem[] = [];
  const showKeysToFetch = new Set<string>();
  const seenShowKeys = new Set<string>();

  for (const item of items) {
    if (item.type === "movie") {
      directItems.push(item);
    } else if (item.type === "show") {
      if (!seenShowKeys.has(item.ratingKey)) {
        seenShowKeys.add(item.ratingKey);
        directItems.push(item);
      }
    } else if (item.type === "episode" && item.grandparentRatingKey) {
      // Episodes should be represented by their parent show
      if (!seenShowKeys.has(item.grandparentRatingKey)) {
        seenShowKeys.add(item.grandparentRatingKey);
        showKeysToFetch.add(item.grandparentRatingKey);
      }
    } else if (item.type === "season" && item.parentRatingKey) {
      // Seasons should be represented by their parent show
      if (!seenShowKeys.has(item.parentRatingKey)) {
        seenShowKeys.add(item.parentRatingKey);
        showKeysToFetch.add(item.parentRatingKey);
      }
    }
  }

  // Fetch actual show metadata for episodes/seasons (in parallel)
  const showMetadataPromises = Array.from(showKeysToFetch).map((key) =>
    client.getMetadata(key)
  );
  const showMetadataResults = await Promise.all(showMetadataPromises);

  // Add fetched shows to the items list
  const fetchedShows: PlexMediaItem[] = showMetadataResults
    .filter((result) => result.success)
    .map((result) => result.data as PlexMediaItem);

  const filteredItems = [...directItems, ...fetchedShows];

  // Map items to view model
  const listItems: ListItem[] = filteredItems.map((item) => ({
    ratingKey: item.ratingKey,
    title: item.title,
    year: item.year,
    type: item.type,
    posterUrl: buildImageUrl(env.PLEX_SERVER_URL, token, item.thumb),
    backdropUrl: buildImageUrl(env.PLEX_SERVER_URL, token, item.art, 800, 450),
    viewCount: item.viewCount ?? 0,
    leafCount: item.leafCount,
    viewedLeafCount: item.viewedLeafCount,
    summary: item.summary,
    duration: item.duration,
    contentRating: item.contentRating,
    audienceRating: item.audienceRating,
    genres: item.Genre?.map((g) => g.tag),
  }));

  return json<LoaderData>({
    title,
    summary,
    itemCount: listItems.length,
    items: listItems,
    listType: type,
    serverUrl: env.PLEX_SERVER_URL,
    token,
  });
}

export default function ListDetailPage() {
  const { title, summary, itemCount, items, listType } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handlePlay = (item: ListItem) => {
    if (item.type === "movie" || item.type === "episode") {
      navigate(`/app/watch/${item.ratingKey}`);
    } else if (item.type === "show") {
      navigate(`/app/media/show/${item.ratingKey}`);
    }
  };

  const handleClick = (item: ListItem) => {
    const mediaType = item.type === "movie" ? "movie" : "show";
    navigate(`/app/media/${mediaType}/${item.ratingKey}`);
  };

  return (
    <Container size="wide" className="py-8">
      {/* Back button and header */}
      <div className="mb-8">
        <Link
          to="/app/lists"
          className="mb-4 inline-flex items-center gap-2 text-sm text-foreground-secondary transition-colors hover:text-foreground-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lists
        </Link>

        <Typography variant="title" as="h1" className="mb-2">
          {title}
        </Typography>

        {summary && (
          <Typography variant="body" className="mb-2 max-w-3xl text-foreground-secondary">
            {summary}
          </Typography>
        )}

        <Typography variant="caption" className="text-foreground-muted">
          {itemCount} {itemCount === 1 ? "item" : "items"} • {listType === "playlist" ? "Playlist" : "Collection"}
        </Typography>
      </div>

      {/* Items grid */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Typography variant="subtitle" className="mb-2">
            This {listType} is empty
          </Typography>
          <Typography variant="body" className="text-foreground-secondary">
            Add items to this {listType} in Plex to see them here.
          </Typography>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => (
            <PosterCard
              key={item.ratingKey}
              ratingKey={item.ratingKey}
              title={item.title}
              posterUrl={item.posterUrl}
              year={item.year?.toString()}
              onClick={() => handleClick(item)}
              onPlay={() => handlePlay(item)}
              onMoreInfo={() => handleClick(item)}
              viewCount={item.viewCount}
              leafCount={item.leafCount}
              viewedLeafCount={item.viewedLeafCount}
              rating={item.audienceRating}
              hideHoverPlay
              details={{
                backdropUrl: item.backdropUrl || undefined,
                releaseDate: item.year?.toString(),
                runtime: formatRuntime(item.duration),
                rating: item.contentRating,
                audienceRating: item.audienceRating?.toFixed(1),
                genres: item.genres,
                summary: item.summary,
                seasons: item.type === "show" ? item.leafCount : undefined,
              }}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
