# Watchtower

Configurations for my HTPC.

## Environment File

Set to `.env`. Referenced in the systemd unit and in each Docker Compose service that supports PUID/PGID env vars. Contains much of the following:

```
DOMAIN=example.com
PGID=1000
PUID=1000
TZ="America/New_York"
CONFIG_PATH=/etc/watchtower
MEDIA_PATH=/var/lib/media
DL_PATH=/tmp
```

## `network_mode: host`
Use when 127.0.0.1 is needed, like when referencing `speedtest` service endpoint for `telegraf`.

## Known Issues

### `watchtower.service: Job watchtower.service/start failed with result 'dependency'.`
`watchtower.service` depends on `networking.service` and `docker.service` being up and running. The former may fail to load in a fresh install of Debian 10.5 if your network interface is not named eth0 (default defined). Edit `/etc/network/interfaces.d/setup` and restart `networking.service`.

### Traefik: `404 page not found`
Enable Traefik on each Docker Compose Service.

```yaml
labels:
- traefik.enable=true
```

Verify the ports are correct and conflicts are addressed. For example, `qbittorrentvpn` and `tautulli` use port 8181 out of the box. One workaround is exposing 8180 at the host level which points to 8181 at the container level.

```yaml
ports:
- 8180:8181
```

### Traefik: `Bad Gateway`
Validate in Traefik dashboard that the HTTP routers/services are active and accurate. With auto-discovery, Traefik will create an HTTP service pointing to the first-defined\* port of the container which may not be the right port for web traffic (e.g. port 8000 vs 9000 on portainer).

\* Not guaranteed. Witnessed qbittorrentvpn HTTP service being set to container\_ip:8080 despite port 8080 not being defined (expected 8181 as defined first).

### Why is Plex in `host` network mode?
~~My smart TV is unable to connect to Plex when in `bridge` mode. All other devices (PCs, tablets, smartphones) work fine in either mode. With `network_mode: host`, Plex will be attached to the home network through the Linux host (sharing its IP and reachable on exposed ports). As such, Traefik can no longer dictate routes to the underlying container and so the host IP:port must be used to reach Plex via browser. Also lose out on the HTTPS certs from Traefik + Let's Encrypt. A bit of an inconvenience but Plex server discovery works well enough.~~

Fixed (11/19): Switching to bridge network mode seems to conflict with the previous (host network mode) state/config. Had to generate a new Plex token, use the token within the 4min lifespan of the token, and create as a new server. Additionally, double-quoting environment variable values (namely PLEX\_CLAIM) causes parsing issues when the initialization process registers a new token.

### Plex: LAN Network (local vs remote streaming)
Plex identifies local devices by comparing subnets. Since Docker provides a largely isolated network (e.g. 172.17.0.0/16), separate from the home network (e.g. 192.168.0.0/24), all clients are considered remote. With remote streams configured to a limit of 8 Mb/s, virtually all content will require transcoding. Transcoding 4K to 4K is a no-no. Direct Play is ideal.

Unfortunately, LAN\_NETWORK env var does not seem to equate to the `LAN Networks` field in the Plex UI (Settings -> Network). Set it (e.g. 192.168.0.0/24) in the latter and verify in Plex Dashboard or Tautulli that the local device is recognized as a local stream.

## TODO

* ~~Automate TLS renewal using Let's Encrypt~~
* ~~Complete Grafana dashboard~~
* Convert setup.sh to Makefile
* ~~Add Ombi for notifications~~
* ~~Add Lidarr for music procurement~~
* ~~Add Tautulli for monitoring Plex~~
