/**
 * TMDB recommendations endpoint.
 * GET /api/tmdb/recommendations?type=movie|show&title=X&year=Y
 *
 * Returns recommendations for a given media title.
 * Gracefully returns empty array if TMDB is not configured.
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import type { TMDBRecommendation } from "~/lib/tmdb/types";

interface RecommendationsResponse {
  recommendations: TMDBRecommendation[];
  source: "tmdb" | "none";
  matchedTitle?: string;
}

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const title = url.searchParams.get("title");
  const yearParam = url.searchParams.get("year");

  // Validate required params
  if (!type || !title) {
    return json(
      { error: "Missing required parameters: type and title" },
      { status: 400 }
    );
  }

  if (type !== "movie" && type !== "show") {
    return json(
      { error: "Invalid type: must be 'movie' or 'show'" },
      { status: 400 }
    );
  }

  // Check if TMDB is configured
  const client = createTMDBClient();
  if (!client) {
    const response: RecommendationsResponse = {
      recommendations: [],
      source: "none",
    };
    return json(response);
  }

  try {
    const year = yearParam ? parseInt(yearParam, 10) : undefined;

    const result =
      type === "movie"
        ? await client.getMovieRecommendationsByTitle(title, year)
        : await client.getTVRecommendationsByTitle(title, year);

    if (!result.success) {
      // Log error but return empty recommendations (graceful degradation)
      console.error(
        `[TMDB] Error fetching recommendations: ${result.error.message}`
      );
      const response: RecommendationsResponse = {
        recommendations: [],
        source: "tmdb",
      };
      return json(response);
    }

    const response: RecommendationsResponse = {
      recommendations: result.data,
      source: "tmdb",
      matchedTitle: title,
    };
    return json(response);
  } catch (error) {
    console.error(
      "[TMDB] Unexpected error:",
      error instanceof Error ? error.message : error
    );
    const response: RecommendationsResponse = {
      recommendations: [],
      source: "tmdb",
    };
    return json(response);
  }
}
