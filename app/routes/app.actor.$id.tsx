/**
 * Actor page - displays media featuring a specific actor.
 * GET /app/actor/:id
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { User } from "lucide-react";
import { Container } from "~/components/layout";
import { PosterCard } from "~/components/media";
import { Typography } from "~/components/ui";
import { requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import type { PlexMediaItem } from "~/lib/plex/types";

interface MediaItemView {
  ratingKey: string;
  title: string;
  year?: string;
  posterUrl: string;
  type: "movie" | "show";
  details: {
    backdropUrl?: string;
    releaseDate?: string;
    runtime?: string;
    seasons?: number;
    episodes?: number;
    rating?: string;
    audienceRating?: string;
    genres?: string[];
    directors?: string[];
    cast?: string[];
    summary?: string;
  };
}

interface LoaderData {
  actorName: string;
  actorPhotoUrl?: string;
  movies: MediaItemView[];
  shows: MediaItemView[];
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const name = data?.actorName ?? "Actor";
  return [
    { title: `${name} | Watchtower` },
    { name: "description", content: `Movies and TV shows featuring ${name}` },
  ];
};

// Use shared image URL helper
import { buildPlexImageUrl } from "~/lib/plex/images";

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

function formatReleaseDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function transformToView(
  item: PlexMediaItem
): MediaItemView {
  const isShow = item.type === "show";
  return {
    ratingKey: item.ratingKey,
    title: item.title,
    year: item.year?.toString(),
    posterUrl: buildPlexImageUrl(item.thumb),
    type: isShow ? "show" : "movie",
    details: {
      backdropUrl: buildPlexImageUrl(item.art),
      releaseDate: formatReleaseDate(item.originallyAvailableAt),
      runtime: !isShow ? formatRuntime(item.duration) : undefined,
      seasons: isShow ? item.childCount : undefined,
      episodes: isShow ? item.leafCount : undefined,
      rating: item.contentRating,
      audienceRating: item.audienceRating?.toFixed(1),
      genres: item.Genre?.map((g) => g.tag),
      directors: item.Director?.map((d) => d.tag),
      cast: item.Role?.slice(0, 5).map((r) => r.tag),
      summary: item.summary,
    },
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requirePlexToken(request);
  const { id } = params;
  const url = new URL(request.url);

  if (!id) {
    throw new Response("Missing actor ID", { status: 400 });
  }

  // Get actor name and photo from query params (passed from CastRow)
  const actorName = url.searchParams.get("name") || "Unknown Actor";
  const actorPhotoUrl = url.searchParams.get("photo") || undefined;

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  // Get all libraries
  const librariesResult = await client.getLibraries();
  if (!librariesResult.success) {
    throw new Response("Failed to load libraries", { status: 500 });
  }

  // Find movie and TV libraries
  const movieLibrary = librariesResult.data.find((lib) => lib.type === "movie");
  const tvLibrary = librariesResult.data.find((lib) => lib.type === "show");

  const movies: MediaItemView[] = [];
  const shows: MediaItemView[] = [];

  // Search movies by actor ID
  if (movieLibrary) {
    const result = await client.getLibraryItemsByActor(movieLibrary.key, id);
    if (result.success) {
      for (const item of result.data) {
        movies.push(transformToView(item));
      }
    }
  }

  // Search TV shows by actor ID
  if (tvLibrary) {
    const result = await client.getLibraryItemsByActor(tvLibrary.key, id);
    if (result.success) {
      for (const item of result.data) {
        shows.push(transformToView(item));
      }
    }
  }

  return json<LoaderData>({
    actorName,
    actorPhotoUrl,
    movies,
    shows,
  });
}

export default function ActorPage() {
  const { actorName, actorPhotoUrl, movies, shows } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const hasContent = movies.length > 0 || shows.length > 0;

  return (
    <div className="min-h-screen pb-16">
      <Container size="wide" className="pt-8">
        {/* Actor Header */}
        <div className="mb-8 flex items-center gap-6">
          {/* Actor Photo */}
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full bg-background-elevated md:h-32 md:w-32">
            {actorPhotoUrl ? (
              <img
                src={actorPhotoUrl}
                alt={actorName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <User className="h-12 w-12 text-foreground-muted md:h-16 md:w-16" />
              </div>
            )}
          </div>

          <div>
            <Typography variant="hero" as="h1">
              {actorName}
            </Typography>
            <Typography variant="body" className="text-foreground-secondary">
              {movies.length} Movie{movies.length !== 1 ? "s" : ""},{" "}
              {shows.length} TV Show{shows.length !== 1 ? "s" : ""}
            </Typography>
          </div>
        </div>

        {/* No Content State */}
        {!hasContent && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <User className="mb-4 h-16 w-16 text-foreground-muted" />
            <Typography variant="subtitle" className="mb-2">
              No content found
            </Typography>
            <Typography variant="body" className="text-foreground-secondary">
              No movies or TV shows featuring this actor were found in your
              library.
            </Typography>
          </div>
        )}

        {/* Movies Section */}
        {movies.length > 0 && (
          <div className="mb-8">
            <Typography variant="title" className="mb-4">
              Movies
            </Typography>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {movies.map((item) => (
                <PosterCard
                  key={item.ratingKey}
                  ratingKey={item.ratingKey}
                  posterUrl={item.posterUrl}
                  title={item.title}
                  year={item.year}
                  details={item.details}
                  onClick={() => {
                    navigate(`/app/media/movie/${item.ratingKey}`);
                  }}
                  onMoreInfo={() => {
                    navigate(`/app/media/movie/${item.ratingKey}`);
                  }}
                  onPlay={() => {
                    console.log(`Play movie: ${item.title}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* TV Shows Section */}
        {shows.length > 0 && (
          <div className="mb-8">
            <Typography variant="title" className="mb-4">
              TV Shows
            </Typography>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {shows.map((item) => (
                <PosterCard
                  key={item.ratingKey}
                  ratingKey={item.ratingKey}
                  posterUrl={item.posterUrl}
                  title={item.title}
                  year={item.year}
                  details={item.details}
                  onClick={() => {
                    navigate(`/app/media/show/${item.ratingKey}`);
                  }}
                  onMoreInfo={() => {
                    navigate(`/app/media/show/${item.ratingKey}`);
                  }}
                  onPlay={() => {
                    console.log(`Play show: ${item.title}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
