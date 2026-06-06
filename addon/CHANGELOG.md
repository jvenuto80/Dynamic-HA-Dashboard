# Changelog
## 1.1.0

- **Switch port maps on NOC device nodes.** Switch nodes now show a UniFi-style
  strip of ports along the bottom of the tile, each cell **color-coded by link
  speed** (FE / GbE / 2.5G / 5G / 10G / SFP / SFP+, plus *Disconnected* and
  *Disabled*) with PoE lightning and uplink/aggregate/mirror role glyphs. SFP/SFP+
  ports are automatically set off from the RJ45 bank by a one-port gap, just like
  a real faceplate.
- **One-click port auto-detect.** In the NOC builder, **Auto-detect ports** reads
  your live UniFi entities and maps the whole switch: it shows **every physical
  port** (even disconnected ones) up to the switch's port count, names each active
  port after its **connected client**, sets its **live link speed/color**, and
  binds the per-port **power-cycle button** + PoE switch automatically.
- **PoE power-cycle from the flyout.** Tap a port to open its detail card with a
  **Power-cycle** action (prefers UniFi's dedicated `button.*_power_cycle`, else
  toggles the PoE switch off → wait → on) and a PoE on/off toggle. The
  **Open-in-HA** button is now labelled with the actual entity name and opens the
  most useful entity (live link-speed sensor) for full history.
- **Node-to-node port links.** Point a port (e.g. an SFP+ uplink) at another NOC
  node; its flyout gets an **Open &lt;device&gt;** jump, and the target node's
  flyout automatically shows a jump back — no duplicate config.
- All port configuration is included in **layout export/import** backups.

## 1.0.3

- **Remote access now works through Home Assistant (no insecure-WebSocket
  error).** When Glance is opened from the Home Assistant sidebar (Ingress) it
  now connects to Home Assistant at the *same address you opened it with*
  instead of a fixed local URL. Accessing HA remotely over HTTPS (e.g. Nabu
  Casa or a reverse proxy) previously tried to open an insecure `ws://`
  connection to the local host, which browsers block as mixed content — now it
  uses `wss://` over the same proxied origin. This means the dashboard works
  both at home and away with no extra setup, and Glance never has to be exposed
  to the internet on its own (Home Assistant proxies everything, including
  camera/image thumbnails). The "Server URL" box is hidden when running behind
  Ingress since it isn't needed there.

## 1.0.2

- **Phone navigation: swipe between pages.** In portrait on a phone the left
  sidebar is hidden, which previously left no way to reach other pages. You can
  now **swipe left/right** to move between pages, and a slim **page indicator**
  at the bottom shows your position and lets you **tap a dot** to jump straight
  to any page. Pages slide directionally as they change. The gesture is
  phone-only, ignores horizontal carousels (so the scenes row still scrolls),
  never interferes with vertical scrolling, and respects reduced-motion.

## 1.0.1

- **Fixed layout export dropping edits.** Exporting your layout silently lost
  data: the export stripped the canonical row/column layout (`rows`) and wrote
  out only the legacy `sections` field, which edits never updated. As a result
  tiles you added were missing, tiles you removed came back, in-app–created
  pages exported empty, and the whole thing round-tripped to a stale state on
  import. Export now keeps the real layout and rebuilds `sections` from it, so
  export → import is lossless (tiles, removed tiles, pages, at-a-glance buttons,
  and their exclusions all carry over). Saved layouts are also kept internally
  consistent on every save.

## 1.0.0

- **First stable release.** Graduating out of beta.
- **Fixed Home Assistant update detection.** The previous `0.9.9.x-beta`
  versioning used a 4-segment number with a `-beta` suffix, which Home
  Assistant's version engine (AwesomeVersion) classifies as an *unknown*
  format it can't order — so the Supervisor couldn't reliably tell which
  build was newer and the update banner misbehaved (appearing to offer "the
  same version"). Versions now follow standard SemVer (`MAJOR.MINOR.PATCH`),
  which the Supervisor orders correctly.
- **Refreshed README screenshots and motion clips.** Regenerated the full
  screenshot set and animation GIFs to reflect the latest UI, and added new
  captures for the **vacuum control center** (live map, room select, suction &
  cleaning mode) and **Music Assistant** (search + active-player casting).

## 0.9.9.9-beta

- **Music Assistant dropdown lists only active players.** Players you disable in
  Music Assistant stay in Home Assistant's entity registry but go `unavailable`,
  so they were still cluttering the speaker dropdown. The list now filters to
  players with a live, available state — disabled/offline players drop off, while
  enabled players (including **sync/speaker groups**) remain. If the
  previously-selected player is no longer available, the picker auto-selects the
  first one.
## 0.9.9.8-beta

- **No-code setup: people, weather, and a blank slate.** Removed the last pieces of
  hard-coded personal data so anyone can set the dashboard up entirely from the
  UI:
  - **People auto-discover.** The header greeting, People tracker and the
    at-a-glance People button now list every `person.*` entity automatically (a
    `config.persons` entry still overrides a display name).
  - **Weather auto-discovers + is selectable.** Fixes the weather widget
    disappearing when the hard-coded `weather.forecast_home_2` entity didn't
    exist. The header forecast and ambient backdrop now resolve any `weather.*`
    entity, and a new **Settings → Appearance → Weather entity** picker lets you
    choose which one (or leave it on **Auto**).
  - **Start blank.** A new **Settings → Dashboard data → Start blank** button
    clears everything to an empty Home page plus an auto-filling Media page, so a
    new user can build their own dashboard from scratch (the old reset is now
    **Reset to default**).
- **Vacuum cards are fully self-service** too — adding any `vacuum.*` entity from
  the tile picker applies the live-map tile and app-like flyout automatically,
  documented in the README.
## 0.9.9.7-beta

- **Vacuum tile quick buttons no longer float mid-map.** After the tile was resized
  to a square, the Clean/Dock quick-action buttons (positioned with `margin-top:
  auto`) ended up parked in the middle of the map. They now anchor to the
  bottom-right corner, opposite the name/status text.
## 0.9.9.6-beta

- **Vacuum tile shows the whole map.** The vacuum tile no longer stretches to fill
  the row and crop the map. It now matches the map's aspect ratio with a capped
  width, so the entire floor plan (every room) is visible in a compact,
  glanceable card instead of a wide, cropped strip.
## 0.9.9.5-beta

- **Vacuum cleaning-mode selector (Vac & Mop / Vac / Mop).** The vacuum flyout now
  always shows a **Mode** selector with friendly labels — **Vac & Mop**, **Vac**,
  **Mop** and **Vac → Mop** (sweep-then-mop). It's driven by the robot's own
  `cleaning_mode_list` so it stays visible even while docked, instead of relying
  on the `cleaning_mode` select entity that the integration hides whenever the
  mop pad isn't mounted.
- **Calmer vacuum tile map.** The live map used as the vacuum tile background no
  longer flashes every few seconds. The volatile per-frame cache-buster is
  stripped from the tile's map URL so the thumbnail stays stable; the flyout map
  still updates live.
## 0.9.9.4-beta

- **App-like vacuum control center.** The vacuum card and flyout were rebuilt to
  feel like the robot's own app. The tile now shows the **live map** as its
  background with battery, status and quick **Clean / Dock** buttons. Opening the
  flyout reveals a full control center: a large live map, a status summary
  (state, docked/charging, battery), primary **Clean / Stop / Dock / Locate**
  controls, a **suction** segmented selector, a **cleaning-mode** selector (when
  the vacuum is awake), **per-room selection** with a one-tap "clean selected
  rooms", and **maintenance** bars for main brush, side brush, filter and
  sensors. Built for the Dreame (Tasshack `dreame_vacuum`) integration.
## 0.9.9.3-beta

- **Manual media-device merge.** When the automatic name matching can't tell that
  two `media_player` entities are the same physical device (abbreviations like
  "LR" vs "Living Room", or possessives), you can now merge them by hand. In the
  Media page's edit mode, tick two or more devices and choose **Merge into one**;
  merged devices show a badge and a **split** button to undo.
- **Media tile size.** A **Small / Medium / Large** selector in the Media page
  edit mode controls how wide the now-playing tiles are. Tiles now use
  fixed-width columns, so a single playing device no longer stretches across the
  whole page.
## 0.9.9.2-beta

- **Smarter media de-duplication everywhere.** One physical device that exposes
  several `media_player` entities (e.g. an Android TV with ADB + Cast + remote)
  is now collapsed to a single entry on the Media page, in the header subtitle,
  and in the at-a-glance strip — using one shared matching rule so the three
  surfaces always agree.
## 0.9.9.1-beta

- **Media page device filter + Music Assistant button.** The Media page edit
  mode gains a type-ahead filter to quickly find devices to show/hide, and a
  toggle to surface the Music Assistant search button right on the page.
## 0.9.9.0-beta

- **Auto "Now Playing" media view.** A new media page type automatically lists
  every media device, shows transport controls only when something is actually
  playing on that device, and lets you hide/show devices in edit mode — no manual
  tile placement required.
## 0.9.8.0-beta

- **Music Assistant search card.** Search your Music Assistant library (artists,
  albums, tracks, playlists) from a right-side flyout and tap a result to play it
  on any Music Assistant player. Artwork shows by default (opt-out per tile), the
  player list is filtered to Music Assistant devices, and the picker uses a custom
  dark-theme dropdown that stays readable and open while you choose.
## 0.9.7.1-beta

- **Slide covers like lights.** Cover tiles get a slide-to-set-position gesture
  matching the light slide-to-dim, and both gestures are **on by default** for all
  light and cover tiles (still toggleable per tile in settings).
## 0.9.7.0-beta

- **Guided onboarding & empty states.** First-run guidance, friendlier empty and
  loading states, optimistic toggles (tiles respond instantly and reconcile with
  HA), and extra depth/polish across the UI.
## 0.9.6.0-beta

- **In-app page management.** Create, rename, re-icon, reorder, and delete pages
  directly in the app — no editing layout JSON by hand.
## 0.9.5.0-beta

- **Visual refinement pass.** Calmer ambient field, fluid (viewport-scaled)
  typography, unified tile styling, and multi-color weather glyphs. The summary
  strip now appears on all tile pages, with security entities excluded from the
  glance defaults.
## 0.9.4.0-beta

- **Header people bubble.** Moved the People avatars into the header's top-right,
  level with the weather, in their own glass bubble matching the weather widget.
- **Scenes moved to the bottom.** The Scenes card now lives at the bottom of the
  page instead of the top, so the room tiles shift up and are visible sooner
  without scrolling.
## 0.9.3.9-beta

- **Compact sections (smarter space).** New **Settings → Appearance → Compact
  sections** toggle (on by default) flows whole sections into a responsive
  masonry so short sections sit side-by-side and fill the screen width, instead
  of each claiming a full-width band with a tall empty gap underneath (e.g.
  Kitchen above Climate & Utilities). Section headings and separation stay
  intact, and sections never split across columns. Column count scales with the
  viewport (1 → 4). Turn it off to stack every section full-width. Sensor views
  keep the full-width stack so their graphs read wide.
## 0.9.3.8-beta

- **Resolution-aware tiles.** Tile width, height and gap now scale with the
  viewport via `clamp()` (min ~104px wide / 78px tall on small tablets like the
  Fire HD, up to 140x96 on large displays). Smaller screens fit more buttons
  with less wasted space; larger screens get roomier tiles.
## 0.9.3.7-beta

- **Tiles fill the row width.** Switched the tile grid from `auto-fill` to
  `auto-fit`, so the tiles in a section stretch to consume leftover space
  instead of leaving phantom empty columns. Tightened the vertical spacing
  between room sections so stacked sections (e.g. Kitchen above
  Climate & Utilities) sit closer together with less dead space.
## 0.9.3.6-beta

- **Tighter masonry between sections.** Narrowed the masonry column width
  (440px → 340px) and enabled `column-fill: balance` so sibling room sections
  (e.g. Kitchen vs Climate & Utilities) balance to roughly equal heights
  instead of leaving a tall blank gap below a short section.
## 0.9.3.5-beta

- **Tiles backfill empty gaps.** Switched the tile grid to `grid-auto-flow: dense`
  so 1x1 tiles fill the space left next to taller (1x2) tiles — e.g. the empty
  area beside a vacuum/cover tile no longer stays blank. Manual tile size
  overrides in **TileSettings** are still respected.
## 0.9.3.4-beta

- **More tiles per screen, less scrolling on tablets.** Light tiles no longer
  expand to a wide 2x1 when turned on — they stay compact 1x1 (the brightness
  slider still works across the tile), so toggling a light doesn't reflow the
  grid. Tile columns are also a bit narrower (min 150px → 128px) to fit more per
  row. You can still set any tile to a larger size manually in tile settings.
- **Scene bar wraps instead of overflowing.** With many scenes, the Scenes card
  now wraps its pills onto multiple rows rather than running off the screen edge.
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
