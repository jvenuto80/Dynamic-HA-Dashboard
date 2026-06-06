# Glance — Dynamic HA Dashboard (Home Assistant Add-on)

Run **Glance** (the Dynamic HA Dashboard) as a Supervisor-managed add-on, available
right from the Home Assistant sidebar via **Ingress** (no extra exposed port,
inherits HA's authentication).

## Install

**One-click** — add this repository to your Home Assistant:

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fjvenuto80%2FDynamic-HA-Dashboard)

Then find **Glance — HA Dashboard** in the store, **Install**, **Start**, and
**Open Web UI** (or use the **Glance** sidebar panel).

> **Note:** the button only *adds the repository* (you still click **Add** in
> the dialog, then install the add-on). On some HA/browser versions it just
> opens the Add-on Store without the dialog — if so, use the manual steps below.

**Manual** — if the button doesn't work:

1. In Home Assistant go to **Settings → Add-ons → Add-on Store**.
2. Click the **⋮** menu (top right) → **Repositories**, and add:
   ```
   https://github.com/jvenuto80/Dynamic-HA-Dashboard
   ```
3. Find **Glance — HA Dashboard** in the store and click **Install**.
4. Click **Start**, then **Open Web UI** (or use the **Glance** sidebar panel).

## First-time setup

The add-on does **not** store your Home Assistant token. On first open:

1. Click the **gear / Settings** icon in the dashboard.
2. Under **Home Assistant**, enter your server URL and a **Long-Lived Access
   Token** (create one in HA → your **Profile → Long-Lived Access Tokens**).
   - Use your HA's **IP address**, e.g. `http://192.168.1.10:8123` — tablets and
     Fully Kiosk often can't resolve `homeassistant.local`, so the IP form is the
     reliable choice. The port is **8123** (HA's normal port).
3. Click **Test connection**, then **Save & reload**.

The token is kept in that browser's `localStorage` only — it is never written to
disk or baked into the image.

> **Tip — set it up once for all your devices:** turn on **Remember connection
> on this server** in Settings. That stores the URL + token on the add-on's
> `/data`, so other devices (tablets, kiosks) auto-connect on first open without
> pasting the token again. It's off by default; turning it back off clears the
> stored connection. Anyone who can open the dashboard can use the saved
> connection, so leave it off if you don't want that.

## Your layout

- A generic starter layout is seeded on first run so you have something to edit.
- **Compact sections** (Settings → Appearance, on by default) flows short
  sections side-by-side so they fill the screen width instead of leaving tall
  vertical gaps — less scrolling on smaller tablets. Section headings stay. Turn
  it off to stack every section full-width.
- Your customizations (views, tiles, and at-a-glance buttons) are saved to the
  add-on's persistent `/data/layouts.json` and survive restarts and updates.

### Bringing an existing layout over

If you already built a dashboard on another device:

1. On the existing dashboard: **Settings → Dashboard data → Export layout**. The
   downloaded file is a full backup — every view, tile and at-a-glance button
   (all NOC nodes, pills, ports — speed, client, PoE/power-cycle bindings, role
   and node-to-node links — panels and per-board header toggles) plus your
   appearance preferences (theme, accent, weather source, and date &amp; duration
   formats). It deliberately leaves out your HA URL and token, so it's safe to
   share or carry between machines.
2. On this add-on, **connect first** — **Settings → Home Assistant**, enter your
   URL + **Long-Lived Access Token**, then **Save & reload**.
3. Then **Settings → Dashboard data → Import layout**, pick the file. The board
   and its look are both restored.

> **Do the token and the import separately, not in one session.** If you enter
> the token *and* import the backup at the same time, the dashboard can reload
> into the imported layout without the connection applied and come up empty. If
> that happens, re-open **Settings**, re-enter the **Long-Lived Access Token**,
> and **Save & reload** — it will then populate with your backup.

## Notes

- **Remote access just works through Ingress.** When you open Glance from the
  Home Assistant sidebar, it connects to HA at the *same address you opened it
  with* — so reaching HA from outside your network (Nabu Casa, a reverse proxy,
  etc.) works automatically over `https`/`wss`, with no insecure-WebSocket
  error and without exposing Glance to the internet. The **Server URL** box is
  hidden in that mode because it isn't needed.
- The **Server URL** setting only applies when you point a browser at the
  add-on's **direct port** (kiosk mode, below) or run it standalone. In that
  case make sure the URL is reachable from the device viewing the dashboard —
  on tablets/kiosks use the **IP form** (`http://<HA-IP>:8123`);
  `homeassistant.local` often won't resolve there.
- **Two ports, don't mix them:** the **Server URL** setting uses HA's API on
  **8123**, while a kiosk browser opens the *dashboard* on the add-on's direct
  port **3000** (see below). There is no port 8124.

## Port / kiosk access (Fully Kiosk Browser, tablets, wall displays)

By default the dashboard is served through **Ingress** only (no extra exposed
port — it inherits Home Assistant's authentication). If you want to point a
**Fully Kiosk Browser**, tablet, or wall display straight at the dashboard, give
it a direct port:

1. Open the add-on → **Configuration** tab. You'll see a **Network** card with a
   row labeled **`3000/tcp`** and an empty box to its left.
2. In that empty box, type the **host port** you want to reach the dashboard on —
   enter **`3000`** (or any other free port).
3. Click **Save**, then go to the **Info** tab and **Restart** the add-on.

Then browse to **`http://<home-assistant-ip>:<port>`** — for example
`http://192.168.1.10:3000` if you entered `3000`. Leaving the box **empty** keeps
the add-on on Ingress only (sidebar panel).

> Use the HA **IP address** in the kiosk URL (e.g. `http://192.168.1.10:3000`), not
> `homeassistant.local` — tablets/Fully Kiosk often can't resolve the `.local`
> name. This dashboard URL uses port **3000**; the **Server URL** inside Settings
> uses **8123**.

> The box on the **left** is the **host** port (the number you type in your
> browser). The **`3000/tcp`** label on the **right** is the container's fixed
> port — don't change that. There is no separate top-level "Network" tab; the
> card lives on the **Configuration** tab (visible once the add-on is started).

### Ingress vs. direct port — what to know

| | Ingress (default) | Direct host port |
| --- | --- | --- |
| URL | **Glance** sidebar panel | `http://<ha-ip>:<port>` |
| HA login | **Required** (wraps the dashboard) | **Not** required on that port |
| Best for | Normal + remote use | Kiosks/tablets on a trusted LAN |

What changes when you set a direct port:

- **You gain** a stable, simple URL that kiosk browsers (Fully Kiosk, tablets,
  wall displays) can auto-launch reliably — no long Ingress token path.
- **No Home Assistant authentication on that port.** Anyone who can reach that
  `IP:port` on your network sees the dashboard UI with no login prompt.
- **Your HA data stays protected by the token.** Glance stores no secrets; it
  only connects to HA after a long-lived token is entered in **Settings** (saved
  per-browser in `localStorage`). A fresh device hitting the port sees an
  unconfigured dashboard until a token is added; your already-set-up kiosk keeps
  showing live data because its token lives in that browser.
- **Keep the port on your LAN.** Do **not** port-forward it to the internet or
  put it behind an unauthenticated reverse proxy — use Ingress for remote access.
- **Both can run at once.** Setting a host port doesn't disable the Ingress
  sidebar panel; leaving the box empty keeps it Ingress-only.

**Recommendation:** use the direct port only on trusted LAN kiosk devices, and
keep Ingress for normal and remote access.

