<div align="center">
  <img src=".github/assets/w-cropped.png" alt="Watchtower" height="240">

  <h1>Watchtower</h1>

  <p><strong>A modern streaming interface for your Plex library</strong></p>

  <p>
    <a href="https://github.com/jovalle/watchtower/releases"><img src="https://img.shields.io/github/v/release/jovalle/watchtower?style=for-the-badge&color=f59e0b" alt="Release"></a>
    <a href="https://github.com/jovalle/watchtower/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/jovalle/watchtower/ci.yml?branch=main&style=for-the-badge&label=build" alt="Build Status"></a>
    <a href="https://github.com/jovalle/watchtower/blob/main/LICENSE"><img src="https://img.shields.io/github/license/jovalle/watchtower?style=for-the-badge&color=f59e0b" alt="License"></a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Node-≥22-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
    <img src="https://img.shields.io/badge/Remix-2.15-000?style=for-the-badge&logo=remix&logoColor=white" alt="Remix">
    <img src="https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React">
    <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  </p>

  <p>
    <img src="https://img.shields.io/badge/Claude-D97757?style=for-the-badge&logo=claude&logoColor=white" alt="Claude">
    <img src="https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
    <img src="https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white" alt="GitHub Actions">
    <img src="https://img.shields.io/badge/plex-%23E5A00D.svg?style=for-the-badge&logo=plex&logoColor=white" alt="Plex">

  </p>
</div>

---

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/2728/512.gif" height="24"> Overview

Watchtower delivers the iconic streaming experience for your personal Plex media library. Hero imagery, smooth animations, clean typography, and pixel-perfect spacing — looks and feels like Netflix but better and with your own content.

Playback progress syncs with Plex across all your devices. TMDB integration surfaces recommendations and rich metadata with graceful fallback when not configured.

It is living proof that you can have a beautiful, user-friendly interface for your media without sacrificing control, privacy, or ownership. Reject the enshittification.

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f3ac/512.gif" height="24"> Features

- **Netflix-style browsing** — Continue Watching, Recently Added, Trending rows
- **Built-in HLS player** — Quality, audio track and subtitle selection, resume playback, and real-time Plex progress sync
- **Rich metadata** — Cast & crew, IMDb ratings, user ratings, and TMDB recommendations
- **Unified watchlist** — Aggregate watchlists from Plex, Trakt, and IMDB in one view
- **Lists support** — Browse your Plex playlists and collections
- **TV show navigation** — Season/episode browsing with On Deck integration
- **Responsive design** — Optimized for desktop, tablet, and mobile

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f4f8/512.gif" height="24"> Screenshots

<p align="center">
  <img src=".github/assets/screenshots/home.png" alt="Home" width="100%">
  <br><em>Home — Continue Watching, Recently Added, and personalized rows</em>
</p>

<p align="center">
  <img src=".github/assets/screenshots/watchlist.png" alt="Watchlist" width="100%">
  <br><em>Watchlist — Unified view of Plex, Trakt, and IMDB watchlists</em>
</p>

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f680/512.gif" height="24"> Quick Start

### Docker (Recommended)

```bash
# Clone and launch
git clone https://github.com/jovalle/watchtower.git
cd watchtower
docker compose up -d

# Get the one-time setup code
docker compose logs watchtower | grep -A2 'setup code'
```

Open `http://localhost:9001`, sign in with the Plex account that owns your server, enter the setup code, and pick a server connection. Watchtower saves the server and its token under `./data/config`, so setup survives restarts. Other users see a "not set up yet" notice until you finish. You can change the server later from **Settings → Server Administration**.

### Local Development

```bash
# Prerequisites: Node.js 22+, Bun (https://bun.sh), and just (https://just.systems)
bun install --frozen-lockfile
just dev
```

Open `http://127.0.0.1:9001`. On first setup, follow the setup code printed in the terminal. `just dev` runs Remix/Vite with live reload for UI and server-route edits; it does not require a production build. Keep the same hostname and port while signing in through Plex.

Use `just dev 9021` if port 9001 is occupied. For testing on another device on your network, explicitly bind all interfaces with `just dev 9021 0.0.0.0` and open your computer's LAN address on that device. Development uses your configured services and local data; requests and playback actions affect those services.

Run `just check` for lint, TypeScript, and tests, or `just test` for tests alone. `just build` followed by `just start` evaluates a production build without live reload. Run `just` to list recipes. Without just, the equivalent dev command is `bun run dev --host 127.0.0.1 --port 9001 --strictPort`.

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/26a1/512.gif" height="24"> Environment Variables

All optional. The Plex server and token are configured at `/setup`, not through the environment.

| Variable          | Description                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`  | Secret for session cookies. Default: generated and saved to `DATA_PATH/config/session-secret` |
| `DATA_PATH`       | Data directory for config and caches (default: `/data` in production, `./data` otherwise)     |
| `PLEX_CLIENT_ID`  | Client identifier (default: `watchtower-001`)                                                 |
| `PORT`            | Server port (default: `9001`)                                                                 |
| `SECURE_COOKIES`  | Set to `true` behind HTTPS                                                                    |
| `TMDB_API_KEY`    | TMDB API key for recommendations and logos ([get free key](https://developer.themoviedb.org)) |

Trakt is enabled only by a saved client ID and secret in Settings → Integrations. A legacy `TRAKT_CLIENT_ID` environment value no longer enables requests; move existing credentials into Integrations to keep using Trakt. Users also need a watchlist username for list imports.

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f6a8/512.gif" height="24"> Security Note

> [!NOTE] > **Plex login may warn about an unfamiliar location**
>
> When signing in, Plex may display a security alert about a login attempt from an unknown IP address or location. This is expected — Watchtower proxies authentication requests through its server, so Plex sees the Watchtower host's IP rather than your device's. You can safely approve the login if you initiated it.

> [!CAUTION] > **Plex "Networks without auth" setting can bypass authentication for all Watchtower users**
>
> If your Plex server has IP addresses or networks configured in **Settings → Network → List of IP addresses and networks that are allowed without auth** (e.g., `192.168.1.0/24`), be aware that Watchtower proxies requests to Plex on behalf of users. This means Plex sees the requests originating from the Watchtower server's IP address, not the end user's.
>
> If the Watchtower host is within an allowed subnet, **all Watchtower users will inherit auth-free access to your Plex server**, regardless of their own location or authentication status. This could unintentionally expose your library to anyone who can access Watchtower.
>
> **Recommendation:** Review your Plex network settings and avoid including the Watchtower host's subnet in the "allowed without auth" list unless this behavior is intentional.

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f433/512.gif" height="24"> Docker Deployment

```bash
# Build and run manually
docker build -t watchtower .
docker run -d -p 9001:9001 -v "$PWD/data:/data" \
  --name watchtower watchtower

# Or use Docker Compose
docker compose up -d        # Start
docker compose logs -f      # View logs
docker compose down         # Stop
```

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f52e/512.gif" height="24"> Roadmap

Here's what's on the horizon:

### Media Server Support

- [ ] **Jellyfin integration** — First-class support for Jellyfin as an alternative to Plex
- [ ] **Multi-server** — Connect multiple media servers simultaneously

### Watchlist & Discovery

- [ ] **Letterboxd sync** — Import watchlists from the film community's favorite platform
- [ ] **Simkl integration** — Sync with Simkl for anime and TV tracking
- [ ] **TMDb lists** — Browse and import TMDb curated lists
- [ ] **TasteDive recommendations** — "If you liked X, you'll love Y" suggestions

### Enhanced Features

- [ ] **Watch party** — Synchronized viewing with friends
- [ ] **Offline mode** — Download media for offline playback
- [ ] **Smart playlists** — Auto-generated playlists based on mood, genre, or watch history
- [ ] **Statistics dashboard** — Viewing habits, most-watched genres, watch time analytics (all private and local)

Have a feature request? [Open an issue](https://github.com/jovalle/watchtower/issues)

## <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f49a/512.gif" height="24"> License

MIT
