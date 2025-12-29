/**
 * IMDB watchlist client.
 * Fetches public watchlists by scraping the watchlist page.
 * Note: IMDB RSS feeds are broken (SSL cert issues), so we parse HTML instead.
 */

import { env } from "~/lib/env.server";

const IMDB_REQUEST_TIMEOUT = 15000; // 15 seconds

/**
 * Parsed IMDB watchlist item.
 */
export interface IMDBWatchlistItem {
  imdbId: string;
  title: string;
  type: "movie" | "show";
  year?: number;
  addedAt?: number;
}

/**
 * Result type for IMDB operations.
 */
export type IMDBResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: number; message: string } };

/**
 * Parse IMDB watchlist page HTML and extract items.
 * Extracts data from the embedded JSON-LD and page content.
 */
function parseIMDBWatchlistHtml(html: string): IMDBWatchlistItem[] {
  const items: IMDBWatchlistItem[] = [];
  const seenIds = new Set<string>();

  // Try to extract from __NEXT_DATA__ JSON (modern IMDB pages)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const titles = nextData?.props?.pageProps?.mainColumnData?.predefinedList?.titleListItemSearch?.edges || [];

      for (const edge of titles) {
        const node = edge?.listItem;
        if (!node?.id) continue;

        const imdbId = node.id;
        if (seenIds.has(imdbId)) continue;
        seenIds.add(imdbId);

        const titleText = node.titleText?.text || node.originalTitleText?.text || imdbId;
        const year = node.releaseYear?.year;
        const titleType = node.titleType?.id || "";

        // Determine type - tvSeries, tvMiniSeries are shows
        const isShow = titleType.toLowerCase().includes("series") ||
                       titleType.toLowerCase().includes("tv");

        items.push({
          imdbId,
          title: titleText,
          type: isShow ? "show" : "movie",
          year,
        });
      }

      if (items.length > 0) {
        return items;
      }
    } catch (e) {
      console.error("[IMDB] Failed to parse __NEXT_DATA__:", e);
    }
  }

  // Fallback: Extract IMDB IDs and basic info from HTML patterns
  // Look for title links with IMDB IDs
  const titlePattern = /<a[^>]*href="\/title\/(tt\d+)\/?[^"]*"[^>]*>([^<]+)<\/a>/g;
  let match;

  while ((match = titlePattern.exec(html)) !== null) {
    const imdbId = match[1];
    if (seenIds.has(imdbId)) continue;
    seenIds.add(imdbId);

    const title = match[2].trim();
    if (!title || title.length < 2) continue;

    items.push({
      imdbId,
      title,
      type: "movie", // Default, will be refined by TMDB lookup
    });
  }

  // If still no items, try extracting just IMDB IDs
  if (items.length === 0) {
    const idPattern = /\/title\/(tt\d{7,})/g;
    while ((match = idPattern.exec(html)) !== null) {
      const imdbId = match[1];
      if (seenIds.has(imdbId)) continue;
      seenIds.add(imdbId);

      items.push({
        imdbId,
        title: imdbId, // Will be filled by TMDB lookup
        type: "movie",
      });
    }
  }

  return items;
}

/**
 * Fetch a single IMDB watchlist by user/list ID.
 */
async function fetchIMDBWatchlist(
  listId: string
): Promise<IMDBResult<IMDBWatchlistItem[]>> {
  // Determine URL based on list type
  let url: string;
  if (listId.startsWith("ur")) {
    url = `https://www.imdb.com/user/${listId}/watchlist`;
  } else if (listId.startsWith("ls")) {
    url = `https://www.imdb.com/list/${listId}`;
  } else {
    return {
      success: false,
      error: { code: 400, message: `Invalid IMDB list ID format: ${listId}` },
    };
  }

  console.log(`[IMDB] Fetching watchlist from: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMDB_REQUEST_TIMEOUT);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: 404,
            message: `IMDB watchlist not found or not public: ${listId}`,
          },
        };
      }
      return {
        success: false,
        error: {
          code: response.status,
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }

    const html = await response.text();
    const items = parseIMDBWatchlistHtml(html);

    console.log(`[IMDB] Found ${items.length} items in watchlist ${listId}`);

    return { success: true, data: items };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: { code: -1, message: "Request timed out" },
        };
      }
      return {
        success: false,
        error: { code: -1, message: error.message },
      };
    }
    return {
      success: false,
      error: { code: -1, message: "Unknown error" },
    };
  }
}

/**
 * Fetch all configured IMDB watchlists and merge them.
 */
export async function getIMDBWatchlists(): Promise<IMDBWatchlistItem[]> {
  const listIds = env.IMDB_WATCHLISTS;

  console.log(`[IMDB] Configured watchlists: ${listIds.length > 0 ? listIds.join(", ") : "none"}`);

  if (listIds.length === 0) {
    return [];
  }

  const results = await Promise.all(listIds.map(fetchIMDBWatchlist));

  // Merge all successful results, deduplicating by IMDB ID
  const itemsById = new Map<string, IMDBWatchlistItem>();

  for (const result of results) {
    if (result.success) {
      for (const item of result.data) {
        if (!itemsById.has(item.imdbId)) {
          itemsById.set(item.imdbId, item);
        }
      }
    } else {
      console.error(`[IMDB] Failed to fetch watchlist:`, result.error.message);
    }
  }

  const items = Array.from(itemsById.values());
  console.log(`[IMDB] Total unique items: ${items.length}`);

  return items;
}

/**
 * Check if IMDB integration is enabled.
 */
export function isIMDBEnabled(): boolean {
  return env.IMDB_WATCHLISTS.length > 0;
}
