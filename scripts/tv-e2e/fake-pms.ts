/** Deterministic fake Plex server for isolated Watchtower TV testing. */
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";

const port = Number(process.argv[2] ?? process.env.PORT ?? 32499);
const mediaDirectory = path.resolve("tmp/tv-e2e/media");
const expectedToken = "fake-owner-token";
const calls: Array<{
  path: string;
  method: string;
  expectedProfileToken: boolean;
}> = [];

const stream = (id: number, type: number, codec: string, extra = {}) => ({
  id,
  streamType: type,
  codec,
  ...extra,
});
const part = (
  id: number,
  file: string,
  duration: number,
  container = "mp4",
  streams = [
    stream(id * 10 + 1, 1, "h264"),
    stream(id * 10 + 2, 2, "aac", { channels: 2, selected: true }),
  ],
) => ({
  id,
  key: `/library/parts/${id}/${file}`,
  duration,
  size: 1,
  container,
  Stream: streams,
});
const media = (id: number, duration: number, parts: object[], container = "mp4") => ({
  id,
  duration,
  bitrate: 2500,
  width: 1280,
  height: 720,
  videoCodec: "h264",
  audioCodec: "aac",
  audioChannels: 2,
  container,
  Part: parts,
});
const item = (
  ratingKey: string,
  type: "movie" | "show" | "season" | "episode",
  title: string,
  extra: Record<string, unknown> = {},
) => ({
  ratingKey,
  key: `/library/metadata/${ratingKey}`,
  guid: `plex://${type}/${ratingKey.padStart(24, "0")}`,
  type,
  title,
  year: 2026,
  thumb: `/library/metadata/${ratingKey}/thumb/1`,
  art: `/library/metadata/${ratingKey}/art/1`,
  ...extra,
});

const movie = item("1", "movie", "Harness Movie", {
  duration: 60_000,
  viewOffset: 12_000,
  Media: [media(10, 60_000, [part(100, "movie.mp4", 60_000)])],
  Guid: [{ id: "tmdb://101" }],
});
const multipartMovie = item("2", "movie", "Two Part Feature", {
  duration: 60_000,
  Media: [
    media(20, 60_000, [
      part(200, "movie-part-1.mp4", 30_000),
      part(201, "movie-part-2.mp4", 30_000),
    ]),
  ],
  Guid: [{ id: "tmdb://102" }],
});
const subtitledMovie = item("3", "movie", "Subtitled Feature", {
  duration: 60_000,
  Media: [
    media(
      30,
      60_000,
      [
        part(300, "movie-subtitled.mkv", 60_000, "mkv", [
          stream(301, 1, "h264"),
          stream(302, 2, "aac", { channels: 2, selected: true }),
          stream(303, 3, "srt", { selected: true }),
          stream(304, 3, "srt", { key: "/library/streams/304" }),
        ]),
      ],
      "mkv",
    ),
  ],
});
const show = item("10", "show", "Harness Show", {
  leafCount: 6,
  viewedLeafCount: 0,
  Guid: [{ id: "tmdb://201" }],
});
const seasons = [
  item("11", "season", "Specials", { parentRatingKey: "10", index: 0 }),
  item("12", "season", "Season 1", { parentRatingKey: "10", index: 1 }),
  item("13", "season", "Season 2", { parentRatingKey: "10", index: 2 }),
];
const episodes = seasons.flatMap((season, seasonOffset) =>
  Array.from({ length: 3 }, (_, episodeOffset) => {
    const ratingKey = String(110 + seasonOffset * 10 + episodeOffset);
    const duration = 30_000;
    return item(ratingKey, "episode", `Episode ${episodeOffset + 1}`, {
      duration,
      parentRatingKey: season.ratingKey,
      grandparentRatingKey: "10",
      grandparentTitle: "Harness Show",
      parentIndex: seasonOffset,
      index: episodeOffset + 1,
      Media: [
        media(
          Number(ratingKey) * 10,
          duration,
          [part(Number(ratingKey) * 100, "episode.mp4", duration)],
        ),
      ],
      Marker: [
        { type: "intro", startTimeOffset: 5_000, endTimeOffset: 15_000 },
        {
          type: "credits",
          startTimeOffset: 25_000,
          endTimeOffset: 30_000,
          final: true,
        },
      ],
    });
  }),
);
const nextEpisode = { ...episodes[4], viewCount: 0 };
const allMetadata = [movie, multipartMovie, subtitledMovie, show, ...seasons, ...episodes];
const byRatingKey = new Map(allMetadata.map((entry) => [entry.ratingKey, entry]));
const files = new Map([
  ["100", "movie.mp4"],
  ["200", "movie-part-1.mp4"],
  ["201", "movie-part-2.mp4"],
  ["300", "movie-subtitled.mkv"],
  ...episodes.map((episode) => [
    String(Number(episode.ratingKey) * 100),
    "episode.mp4",
  ] as const),
]);

function json(response: ServerResponse, value: unknown) {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

function container(response: ServerResponse, Metadata: unknown[]) {
  json(response, {
    MediaContainer: { Metadata, totalSize: Metadata.length, offset: 0 },
  });
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const suppliedToken =
    request.headers["x-plex-token"] ?? url.searchParams.get("X-Plex-Token");
  if (url.pathname === "/__calls") return json(response, calls);
  calls.push({
    path: `${url.pathname}${url.search}`.replace(
      /X-Plex-Token=[^&]+/g,
      "X-Plex-Token=***",
    ),
    method: request.method ?? "GET",
    expectedProfileToken: suppliedToken === expectedToken,
  });

  if (url.pathname === "/") {
    return json(response, {
      MediaContainer: {
        machineIdentifier: "fake-machine",
        friendlyName: "Fake PMS",
        version: "1",
        platform: "test",
        platformVersion: "1",
        myPlex: true,
      },
    });
  }
  if (url.pathname === "/library/sections") {
    return json(response, {
      MediaContainer: {
        Directory: [
          { key: "1", type: "movie", title: "Movies", uuid: "movies" },
          { key: "2", type: "show", title: "Shows", uuid: "shows" },
        ],
      },
    });
  }
  if (url.pathname === "/library/sections/1/all") {
    return container(response, [movie, multipartMovie, subtitledMovie]);
  }
  if (url.pathname === "/library/sections/2/all") {
    return container(response, [show]);
  }
  if (url.pathname === "/library/all") {
    return container(response, [movie, multipartMovie, subtitledMovie, show]);
  }
  if (url.pathname === "/library/recentlyAdded") {
    return container(response, [movie, show]);
  }
  if (url.pathname === "/hubs/continueWatching/items") {
    return container(response, [movie, nextEpisode]);
  }
  if (url.pathname === "/hubs") {
    return json(response, {
      MediaContainer: {
        Hub: [
          {
            title: "Harness Collection",
            hubIdentifier: "custom.collection.500",
            promoted: true,
            Metadata: [movie, multipartMovie],
          },
        ],
      },
    });
  }
  if (url.pathname === "/hubs/search") {
    return json(response, {
      MediaContainer: {
        Hub: [
          { type: "movie", Metadata: [movie, multipartMovie] },
          { type: "show", Metadata: [show] },
        ],
      },
    });
  }
  const children = /^\/library\/metadata\/([^/]+)\/children$/.exec(url.pathname);
  if (children) {
    if (children[1] === "10") return container(response, seasons);
    const seasonIndex = seasons.findIndex(
      (season) => season.ratingKey === children[1],
    );
    return container(
      response,
      seasonIndex < 0
        ? []
        : episodes.slice(seasonIndex * 3, seasonIndex * 3 + 3),
    );
  }
  if (url.pathname === "/library/metadata/10/allLeaves") {
    return container(response, episodes);
  }
  const metadataMatch = /^\/library\/metadata\/([^/]+)$/.exec(url.pathname);
  if (metadataMatch) {
    const metadata = byRatingKey.get(metadataMatch[1]);
    if (metadata) return container(response, [metadata]);
  }
  if (url.pathname === "/library/sections/1/collections") {
    return container(response, [
      { ratingKey: "500", title: "Harness Collection", childCount: 2 },
    ]);
  }
  if (url.pathname === "/library/collections/500/children") {
    return container(response, [movie, multipartMovie]);
  }
  if (url.pathname === "/playlists") {
    return container(response, [
      {
        ratingKey: "600",
        title: "Harness Playlist",
        leafCount: 2,
        duration: 120_000,
        smart: false,
      },
    ]);
  }
  if (url.pathname === "/playlists/600/items") {
    return container(response, [
      { ...movie, playlistItemID: 700 },
      { ...subtitledMovie, playlistItemID: 701 },
    ]);
  }
  const fileMatch = /^\/library\/parts\/(\d+)\//.exec(url.pathname);
  if (fileMatch && request.method === "GET") {
    const file = files.get(fileMatch[1]);
    if (!file) {
      response.statusCode = 404;
      return response.end();
    }
    const target = path.join(mediaDirectory, file);
    const size = statSync(target).size;
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || end < start) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      return response.end();
    }
    response.writeHead(range ? 206 : 200, {
      "Content-Type": file.endsWith(".mkv")
        ? "video/x-matroska"
        : "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    return createReadStream(target, { start, end }).pipe(response);
  }
  if (url.pathname === "/library/streams/304") {
    response.setHeader("Content-Type", "text/plain");
    return response.end(
      "1\n00:00:00,000 --> 00:00:02,000\nHarness external subtitle\n",
    );
  }
  if (url.pathname.endsWith("/decision")) {
    return json(response, {
      MediaContainer: {
        generalDecisionCode: 1000,
        Metadata: [
          {
            Media: [
              {
                Part: [
                  {
                    Stream: [
                      { streamType: 1, decision: "copy" },
                      { streamType: 2, decision: "copy" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  }
  if (url.pathname.endsWith("/start.m3u8")) {
    response.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return response.end(
      `#EXTM3U\nsession/${url.searchParams.get("session")}/base/index.m3u8\n`,
    );
  }
  if (/\/session\/[^/]+\/base\/index\.m3u8$/.test(url.pathname)) {
    response.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return response.end(
      readFileSync(path.join(mediaDirectory, "hls-4", "index.m3u8"), "utf8"),
    );
  }
  const segment = /\/session\/[^/]+\/base\/(segment-\d+\.ts)$/.exec(
    url.pathname,
  );
  if (segment) {
    response.setHeader("Content-Type", "video/mp2t");
    return createReadStream(path.join(mediaDirectory, "hls-4", segment[1])).pipe(
      response,
    );
  }
  if (url.pathname.endsWith("/ping") || url.pathname.endsWith("/stop")) {
    return json(response, {});
  }
  if (
    ["/:/timeline", "/:/scrobble", "/:/unscrobble", "/:/rate"].includes(
      url.pathname,
    ) ||
    (url.pathname.startsWith("/library/parts/") && request.method === "PUT") ||
    (url.pathname.startsWith("/playlists/") && request.method !== "GET")
  ) {
    return json(response, {});
  }
  response.statusCode = 404;
  return json(response, { MediaContainer: {} });
}).listen(port, "127.0.0.1", () =>
  console.error(`fake PMS listening on ${port}`),
);