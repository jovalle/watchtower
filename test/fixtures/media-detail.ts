export function mediaDetailFixture(type: "movie" | "show" | "season" | "episode", isInWatchlist = false) {
  return {
    metadata: { ratingKey: "42", title: "Example Title", type, summary: "A fixture for checking Watchtower's media actions." },
    type, backdropUrl: "", posterUrl: "", year: "2024", duration: "2h", contentRating: "PG",
    criticRating: null, audienceRating: null, userRating: null, isAudienceFromPlex: false,
    externalRatings: null, plexAudienceRating: null, genres: ["Drama"], directors: [], writers: [], studio: null,
    cast: [], similar: [], recommendations: [], seasons: [], episodes: [], breadcrumbs: [],
    viewCount: 1, leafCount: 2, viewedLeafCount: 2, isInWatchlist,
    seasonIndex: 1, episodeIndex: 1, tmdbId: 17, imdbId: "tt17", trailerKey: "fixtureKey1",
    audioStreams: [], subtitleStreams: [],
  };
}
