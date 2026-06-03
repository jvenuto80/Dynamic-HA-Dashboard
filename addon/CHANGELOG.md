# Changelog
## 0.9.3.3-beta

- **Fix shared connection not carrying over to other devices.** The server now
  only stores a complete connection (non-empty URL **and** token), and a device
  adopts the shared connection when its own connection is incomplete (e.g. a
  tablet with a token but no URL, which previously fell back to the unreachable
  `homeassistant.local` default and showed "Connection failed"). Saving with the
  toggle on now stores the effective URL instead of an empty field value.
## 0.9.3.2-beta

- **No-cache for the HTML entry point.** The preview server now sends
  `Cache-Control: no-cache` for `index.html` so kiosks/tablets always pick up the
  latest build after an add-on update (content-hashed JS/CSS stay cached). Fixes
  the dashboard showing stale UI until a manual cache clear.
## 0.9.3.1-beta

- **Update now reliably rebuilds from source.** Added a cache-bust step before the
  `git clone` in the Dockerfile so an add-on **Update** always pulls the latest
  `main` instead of reusing a cached (stale) clone layer. Previously only the
  **Rebuild** button (`--no-cache`) guaranteed fresh source.
## 0.9.3-beta

- **Remember connection on this server** (opt-in) — a new toggle in **Settings →
  Home Assistant** stores the server URL + token on the add-on's `/data` so new
  devices (tablets, kiosks) connect automatically without pasting the token on
  each one. Off by default; the token stays per-device unless you enable it, and
  you can turn it off (which clears the stored connection) anytime.
## 0.9.2.2-beta

- Document the **Web UI port (`3000`)** on the add-on page so kiosk setups
  (Fully Kiosk Browser, tablets, wall displays) know where to point. Clarified
  the port description and added a Network/port setup section to the docs.
## 0.9.2.1-beta

- Rebrand to **Glance**: add-on store name, sidebar panel, and repo all show
  the Glance name. The panel title only applies when the add-on (re)starts —
  restart the add-on after updating if it still shows the old name.
## 0.9.2.1-beta

- Force the sidebar panel to re-register so it shows **Glance** (the panel
  title is only applied when the add-on (re)starts). Restart the add-on after
  updating if it still shows the old name.

## 0.9.2-beta

- Sidebar panel is now named **Glance** (was "Dashboard").

## 0.9.1-beta

- Fix Docker build failure: declare `ARG BUILD_FROM` in the global scope
  (before the first `FROM`) so the runtime stage's base image resolves.

## 0.9.0-beta

- Added add-on icon and logo.
- Added a one-click **Add to Home Assistant** repository button in the docs.
- Beta release for hardware/Ingress testing.

## 0.8.0

- Initial Home Assistant add-on release.
- Serves the Dynamic HA Dashboard via Ingress.
- Persists layout/glance config to `/data/layouts.json`.
- Seeds a generic starter layout on first run.
- Token entered in-app (Settings), never stored on disk.
