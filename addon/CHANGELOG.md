# Changelog
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
