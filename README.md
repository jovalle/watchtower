<div align="center">

<img src="./watchtower.jpeg" height="400px"/>

# Watchtower

A self-hosted Kaleidescape.

"The ultimate movie (+series/music/audiobooks/comics) platform"

</div>

## 🐳 Docker Compose

At the heart of the project is Docker, Docker Compose v2 to be specific. Makes for easy deployment to, and management of, a singular host.

See `docker-compose.yaml` for the services deployed.

## 🧰 Core Components

- [Jellyfin](https://jellyfin.org): Self-hosted Hulu. Plex competitor. Currently running comparisons. One advantage for Jellyfin is the lack of a SaaS and support for more media types (comics, audiobooks)
- [Jellyseerr](https://docs.jellyseerr.dev/): Manages media requests and issue tracking. Supports Jellyfin and Plex.
- [Navidrome](https://www.navidrome.org/): Self-hosted Spotify.
- [Plex](https://plex.tv): Self-hosted Netflix with music streaming.

### 💿 Media Curators

- 🔊 [Lidarr](https://lidarr.audio/)
- 🎬 [Radarr](https://radarr.video/)
- 📺 [Sonarr](https://sonarr.tv/)

### 📊 Dashboards

- [Homepage](https://gethomepage.dev): Easily configurable dashboard with plugins for key services.

![image](https://github.com/jovalle/watchtower/assets/47045210/6c11573d-08c5-414c-8814-f11e244b796d)

- [Tautulli](https://tautulli.com/): Plex server monitoring. Especially useful for troubleshooting stream performance and issues.

## 📋 Prerequisites

### Environment File

`.env` stores common variables to be referenced by virtually all docker compose services via `env_file` parameter. See sample below.

```sh
# general
DOMAIN="example.net"
DOMAIN_EXT="example.com"
HOST_IP=192.168.1.2
PGID=1000
PUID=1000
TZ="America/New_York"

# apps
PLEX_API_KEY=REDACTED
PORTAINER_API_KEY=REDACTED

# cloudflare
CF_API_EMAIL=REDACTED
CF_API_KEY=REDACTED

# media
MEDIA_PATH=/media

# optional (if deploying containers remotely and without systemd)
DOCKER_HOST_IP=${HOST_IP}
DOCKER_HOST="ssh://root@${DOCKER_HOST_IP}"
```

⚠️ Virtually all docker compose services are leveraging `.env`. Changes to the file will trigger recreations of virtually all containers. May look into creating specific environment files for each container to address this. Wish I could just uses SOPS for inline encryption of `docker-compose.yaml`.

### 💾 Media

Consolidated all of my data onto one giant pool. Example mount:

```sh
# cat /etc/fstab
//nexus/Media /media cifs credentials=/etc/watchtower/.smb-credentials,uid=1000,gid=1000,file_mode=0644,dir_mode=0755,iocharset=utf8,vers=3.0 0 0
```

To avoid containers reading/writing on erroneous paths (if the expected mount is missing, it will be created locally), the `media` service continuously checks for the mount and fails if missing. Using `depend_on`, dependents will not start until mounted properly.

```yaml
media:
  command: [
      "/bin/sh",
      "-c",
      "if grep -q '^//nexus/Media /media ' /proc/mounts; then echo 'Media
      mounted'; sleep infinity; else echo 'Media not mounted' >&2; cat
      /proc/mounts; exit 1; fi",
    ]
  container_name: media
  healthcheck:
    interval: 10s
    retries: 3
    test: ["CMD", "grep", "-q", "^//nexus/Media /media ", "/proc/mounts"]
    timeout: 2s
  image: ubuntu
  restart: no
  volumes:
    - /media:/media:ro
```

## 🚀 Deployment

Ideally, `git clone` this repo at `/etc/watchtower` on the target host.

To deploy locally:

```sh
make install
```

To deploy remotely, ensure:

- Host is accessible via SSH
- Host has docker compose installed
- SSH params are tweaked (`MaxStartups 200`)
- `DOCKER_HOST` is set locally

```sh
make start
```
