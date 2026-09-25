/**
 * Search page - searches the Plex library and, unless the user chose library-only, TMDB titles not in the library.
 * GET /app/search?q=<query>
 */

import { useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useNavigation, useSearchParams } from "@remix-run/react";
import { Loader2, Search } from "lucide-react";
import { Container } from "~/components/layout";
import { PosterCard } from "~/components/media";
import { RequestModal, type RequestableItem } from "~/components/media/RequestModal";
import { Typography } from "~/components/ui";
import { createSeerrClient } from "~/lib/integrations/seerr.server";
import { requireServerToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { buildPosterUrl } from "~/lib/plex/images";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import { excludeLibraryMatches } from "~/lib/search";
import { env } from "~/lib/env.server";
import { getCurrentUser } from "~/lib/auth/user.server";
import { getUserSettings } from "~/lib/settings/storage.server";
import type { TMDBRecommendation } from "~/lib/tmdb/types";

export const meta: MetaFunction = () => [{ title: "Search | Watchtower" }];

interface LibraryResult {
  ratingKey: string;
  type: "movie" | "show";
  title: string;
  year?: string;
  posterUrl: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);
  const seerrEnabled = Boolean(await createSeerrClient());
  if (!q) {
    return json({ q, library: [] as LibraryResult[], discover: [] as TMDBRecommendation[], seerrEnabled });
  }

  const client = new PlexClient({ serverUrl: env.PLEX_SERVER_URL, token, clientId: env.PLEX_CLIENT_ID });
  const user = await getCurrentUser(request);
  const discoveryDisabled = user ? (await getUserSettings(user.id))?.preferences.discoveryDisabled : false;
  const tmdb = discoveryDisabled ? null : createTMDBClient();
  const [plexResult, tmdbResult] = await Promise.all([
    client.search(q),
    tmdb ? tmdb.searchMulti(q) : null,
  ]);

  const plexItems = plexResult.success ? plexResult.data : [];
  const library: LibraryResult[] = plexItems.map((item) => ({
    ratingKey: item.ratingKey,
    type: item.type as "movie" | "show",
    title: item.title,
    year: item.year?.toString(),
    posterUrl: buildPosterUrl(item.thumb),
  }));
  const discover = tmdbResult?.success
    ? excludeLibraryMatches(tmdbResult.data, plexItems).slice(0, 24)
    : [];

  return json({ q, library, discover, seerrEnabled });
}

export default function SearchPage() {
  const { q, library, discover, seerrEnabled } = useLoaderData<typeof loader>();
  const [requestItem, setRequestItem] = useState<RequestableItem | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [value, setValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed === (searchParams.get("q") || "")) return;
    debounceRef.current = setTimeout(() => {
      setSearchParams(trimmed ? { q: trimmed } : {}, { replace: true, preventScrollReset: true });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, searchParams, setSearchParams]);

  const isSearching = navigation.state === "loading" && navigation.location?.pathname === "/app/search";

  return (
    <Container className="py-8">
      <div className="relative mb-8 max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-muted" />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search movies and shows"
          aria-label="Search movies and shows"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full rounded-md border border-border-subtle bg-background-elevated py-3 pl-12 pr-12 text-lg text-foreground-primary placeholder:text-foreground-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        {isSearching && (
          <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-foreground-muted" />
        )}
      </div>

      {!q && (
        <Typography variant="body" className="text-foreground-secondary">
          Search your library by title. Press ⌘K or Ctrl+K from anywhere to jump here.
        </Typography>
      )}

      {q && library.length === 0 && discover.length === 0 && !isSearching && (
        <Typography variant="body" className="text-foreground-secondary">
          No results for “{q}”.
        </Typography>
      )}

      {library.length > 0 && (
        <section className="mb-10">
          <Typography variant="subtitle" as="h2" className="mb-4">
            In your library
          </Typography>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {library.map((item) => {
              const detailPath = `/app/media/${item.type}/${item.ratingKey}`;
              return (
                <PosterCard
                  key={item.ratingKey}
                  ratingKey={item.ratingKey}
                  posterUrl={item.posterUrl}
                  title={item.title}
                  year={item.year}
                  hideHoverPlay
                  onClick={() => navigate(detailPath)}
                  onMoreInfo={() => navigate(detailPath)}
                />
              );
            })}
          </div>
        </section>
      )}

      {discover.length > 0 && (
        <section>
          <Typography variant="subtitle" as="h2" className="mb-4">
            Not in your library
          </Typography>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {discover.map((item) => (
              <PosterCard
                key={`${item.type}-${item.id}`}
                posterUrl={item.posterUrl || ""}
                title={item.title}
                year={item.releaseDate?.slice(0, 4)}
                hideHoverPlay
                onClick={() =>
                  seerrEnabled
                    ? setRequestItem({
                        tmdbId: item.id,
                        type: item.type,
                        title: item.title,
                        year: item.releaseDate?.slice(0, 4),
                        posterUrl: item.posterUrl,
                        tmdbUrl: item.tmdbUrl,
                      })
                    : window.open(item.tmdbUrl, "_blank", "noopener,noreferrer")
                }
              />
            ))}
          </div>
        </section>
      )}

      {requestItem && <RequestModal item={requestItem} onClose={() => setRequestItem(null)} />}
    </Container>
  );
}
