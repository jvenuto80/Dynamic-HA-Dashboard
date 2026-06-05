<p align="center">
  <img src="addon/logo-glance.png" alt="Glance — Dynamic HA Dashboard" width="520" />
</p>

# Glance — HA Dashboard

**Glance** is a custom, high-polish Home Assistant dashboard built with **React 19 +
TypeScript + Vite**. It talks directly to Home Assistant over its WebSocket API,
renders a fully editable tile/room layout, and layers on a lot of "premium feel"
motion and ambient effects.

> Companion file: [TODO.md](./TODO.md) tracks remaining ideas and decisions.

> 📖 **For full documentation** — installation, configuration, features, layout
> backup/restore, architecture, add-on development, and troubleshooting — see the
> **[Glance Wiki](https://github.com/jvenuto80/Dynamic-HA-Dashboard/wiki)**.

<a href="https://venmo.com/u/jvenuto" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20beer-%F0%9F%8D%BA-FF8C42?style=for-the-badge" alt="Buy me a beer" /></a>

---

## Screenshots

|  |  |
|---|---|
| ![Main dashboard](screenshots/01-main.png) | ![Now-playing flyout](screenshots/20-flyout-media.png) |
| **Main dashboard** — editable tile/room layout | **Media flyout** — now-playing artwork, scrubber, transport |
| ![Light flyout](screenshots/21-flyout-light.png) | ![Edit mode](screenshots/30-edit-mode.png) |
| **Light flyout** — brightness, color, live glow | **Edit mode** — drag-and-drop tile arrangement |
| ![Settings](screenshots/40-settings.png) | ![Ambient — rain](screenshots/50-ambient-rain.png) |
| **Settings** — themes, accent color, connection | **Ambient backdrop** — weather-reactive rain (with lightning in thunderstorms) |
| ![Ambient — snow](screenshots/51-ambient-snow.png) | ![Ambient — night](screenshots/52-ambient-night.png) |
| **Ambient backdrop** — snow particles | **Ambient backdrop** — night time-of-day tint |
| ![Ambient — dusk](screenshots/53-ambient-dusk.png) | ![Ambient — rain at night](screenshots/54-ambient-rain-night.png) |
| **Ambient backdrop** — dusk gradient | **Ambient backdrop** — rain + night combined |

### Responsive

The same layout reflows from a full-size wall display down to a phone screen.

<img src="screenshots/60-mobile.png" alt="Mobile layout" width="300" />

---

## Motion

Stills don't do the motion justice — these short clips show the live animations.

**View switching** — staggered tile-entrance cascade

![View switching](media/01-view-switching.gif)

**Media flyout** — spring-open with shared-element artwork morph

![Media flyout](media/02-media-flyout.gif)

**Ambient backdrop** — weather-reactive rain particles

![Ambient rain](media/03-ambient-rain.gif)

**Thunderstorm** — rain plus lightning flashes (toggle in Settings → Appearance)

![Ambient storm](media/06-ambient-storm.gif)

**Light flyout** — brightness drag + warmth/color controls

![Light flyout](media/04-light-flyout.gif)

**Edit mode** — drag-and-drop tile arrangement

![Edit mode](media/05-edit-mode.gif)

---

## Quick start

```bash
npm install
npm run dev        # Vite dev server on http://localhost:3000
npm run build      # tsc -b + vite build  → dist/
npm run preview    # serve the production build
```

Strict TypeScript is enforced (`noUnusedLocals`); **the build must be 0 errors.**

### Connecting to Home Assistant

Connection values resolve in this order: **Settings (localStorage) → Vite env →
default**.

| Source            | Key                       |
| ----------------- | ------------------------- |
| Settings modal    | HA URL + long-lived token |
| `.env`            | `VITE_HA_URL`, `VITE_HA_TOKEN` |
| Hard default      | `http://homeassistant.local:8123` |

Copy `.env.example` → `.env` to set a URL/token at build time, or enter them in
the in-app Settings modal (saved to `localStorage`).

### Set up from scratch — no code required

Everything below is done in the running app; you never edit `config.ts` or
`layouts.json` by hand:

1. **Connect.** On first launch the **guided onboarding** asks for your HA URL and
   a long-lived token (create one in HA → *Profile → Security*), with a **Test**
   button to confirm before saving.
2. **Start blank.** Open **Settings → Dashboard data → Start blank** to clear the
   sample layout and begin with an empty **Home** page plus a zero-config
   **Media** page. (**Reset to default** restores the bundled sample instead.)
3. **Add pages.** Use **PagesManager** to create, rename, re-icon, reorder, and
   delete pages.
4. **Add tiles.** In **Edit mode**, click **+ Add Tile** and pick any entity from
   the searchable picker (lights, switches, covers, locks, climate, media,
   **vacuum**, sensors, scenes, scripts, buttons, and more). Drag to arrange;
   open **per-tile settings** for camera entity, links, quick actions, flyout
   options, slider direction, and size.
5. **Add scenes.** Each page has a scene picker; scenes you add show with their HA
   friendly name and icon automatically.
6. **People appear automatically.** Every `person.*` entity is discovered and
   shown in the header / People tracker — no configuration needed.
7. **Weather appears automatically.** The header forecast + ambient backdrop pick
   up any `weather.*` entity; choose a specific one in Settings → Appearance if
   you have several.
8. **Theme it.** Pick a theme + accent color in Settings.

The bundled `config.ts` catalogs (sample `scenes`, `persons`, and `rooms`) are
only a starting **seed**; a connected user can replace all of it from the UI, and
**Start blank** gives them a clean slate to do so.

---

## Run as a Home Assistant Add-on

Prefer to run it on the HA server itself? The dashboard ships as a
Supervisor-managed add-on (served from the sidebar via **Ingress**).

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fjvenuto80%2FDynamic-HA-Dashboard)

Click the button above to open the **Add repository** dialog pre-filled in your
own Home Assistant, then click **Add**.

> **Heads-up:** the button only *adds the repository* — it does not install the
> add-on, and on some HA/browser versions it just opens the Add-on Store without
> popping the dialog. If that happens, use the manual steps below.

**Manual install (always works, HA OS / Supervised):**

1. **Settings → Add-ons → Add-on Store**.
2. Top-right **⋮** menu → **Repositories**.
3. Paste this URL and click **Add**, then **Close**:
   ```
   https://github.com/jvenuto80/Dynamic-HA-Dashboard
   ```
4. Refresh the store (pull-to-refresh / reload). A new **Glance — HA Dashboard
   Add-ons** section appears.
5. Open **Glance — HA Dashboard** → **Install** → **Start** → **Open Web UI**
   (it also appears as **Glance** in the sidebar).

> First install builds from source on your device (clones the repo + `npm run
> build`), so it can take several minutes and needs internet access. Requires a
> Supervisor (HA OS or Supervised) — HA Container/Core have no add-on store.

See [`addon/README.md`](addon/README.md) for first-time token setup and layout
import/export.

---

## Architecture

```
src/
  main.tsx            App bootstrap: applyTheme(), installHaptics()
  App.tsx             Top-level shell: sidebar, header, views, detail flyout
  config.ts           Seed catalogs (sample scenes[]/persons[]/rooms[], HA_URL/TOKEN); replaceable from the UI
  settings.ts         App settings (localStorage) + applyTheme()
  types.ts            Shared layout / entity types

  hooks/
    useHomeAssistant.ts  WebSocket connection, entity state, callHA, history/forecast
    useLayout.ts         Loads/saves the layout (views, tiles, glance); export/import; startBlank/reset
    useArtworkColor.ts   Extracts a dominant color from now-playing artwork

  lib/
    layout.ts          viewRows() and layout helpers
    tileSize.ts        Tile span/size logic
    glance.ts          At-a-glance metric catalog + computeMetric()
    mediaDevices.ts    Media de-dup: friendlyName, deviceNameKey, group/dedupe (+ manual merges)
    persons.ts         resolvePersons(): auto-discover person.* (config names override)
    weather.ts         resolveWeatherId(): auto-discover/select the weather.* entity
    colorExtract.ts    Canvas-based dominant-color extraction
    viewTransition.ts  View Transitions API wrapper (shared-element morphs)
    haptics.ts         navigator.vibrate + delegated press listener
    entityInfo.ts      Per-domain display helpers

  components/          One component per surface (see Features below)
  styles/theme.css     All styling + animations (single stylesheet)

vite-layout-plugin.ts  Dev/preview middleware: GET/POST/DELETE /layout (honors LAYOUT_FILE)
layouts.json           Persisted custom layout (on the add-on: /data/layouts.json)
```

### Data flow

- `useHomeAssistant` opens the WS connection, subscribes to entity states, and
  exposes `entities`, `connected`, `error`, `callHA(domain, service, …)`,
  `getForecast`, and `getHistory`.
- `useLayout` loads the editable layout from `/layout` (falls back to a default),
  and writes changes back via the Vite middleware to `layouts.json` (or
  `/data/layouts.json` on the add-on). It also exposes `exportLayout()` /
  `importLayout()` for moving a layout between devices/deploys.
- `App` resolves the active view, renders its scenes + tiles, and owns the
  `DetailPanel` flyout (entity controls, camera, history, links, quick actions).

---

## Features

### Layout & editing
- **Multiple views/pages** with a left **Sidebar** + **RoomNav**.
- **Compact sections** (Settings → Appearance, on by default) — flows whole
  sections into a responsive masonry so short sections sit side-by-side and fill
  the screen width, instead of each claiming a full-width band with a tall empty
  gap underneath. Section headings and separation stay intact; sections never
  split across columns; column count scales with the viewport. Far less vertical
  scrolling on smaller tablets. Turn it off to stack every section full-width.
- **Edit mode** — drag-and-drop tiles (`@dnd-kit`), add/remove tiles, add/reorder/
  remove scenes per view, reset to defaults. Saved to `layouts.json` (syncs across
  devices on the same host; persists to `/data` on the add-on).
- **Per-tile settings** (`TileSettings`) — camera entity, links, quick actions,
  flyout config, reverse slider, custom artwork entity, tile size/span.
- **Layout export / import** (Settings → Dashboard data) — download the full
  layout as JSON and re-import it on a new device or deploy.
- **Start blank / Reset** (Settings → Dashboard data) — **Start blank** wipes the
  layout to an empty Home page + auto-filling Media page for a clean no-code
  start; **Reset to default** restores the bundled sample layout.
- **Auto-discovered people** — every `person.*` entity shows in the header and
  People tracker with its friendly name, no config needed (a `config.persons`
  entry can still override the display name).
- **Weather, no hard-coding** — the header forecast and ambient backdrop
  auto-discover a `weather.*` entity; pick a specific one in **Settings →
  Appearance → Weather entity** (or leave it on **Auto**).

### Tiles & cards
- `DeviceTile` — lights, switches, media players, covers, locks, buttons, etc.
  with slide-to-dim, **slide-to-set-position for covers**, live artwork
  backgrounds, and per-domain controls. Slide gestures are on by default for all
  light and cover tiles.
- `ClimateCards`, `LockCards`, `VacuumCard`, `CameraGrid`, `SensorWidgets`,
  `RoomCard` / `RoomPanel`, `PersonTracker`, `Sparkline`, `ScenePills`.
- **App-like vacuum control** — the vacuum tile shows the **live map** as its
  background with battery, status and quick Clean/Dock buttons; its flyout is a
  full control center (large live map, status summary, Clean/Stop/Dock/Locate,
  suction + cleaning-mode selectors with friendly **Vac & Mop / Vac / Mop / Vac →
  Mop** labels, per-room selection with one-tap clean, and maintenance bars for
  brushes/filter/sensors). Built for the Dreame (Tasshack `dreame_vacuum`)
  integration. **Add it yourself** by picking any `vacuum.*` entity in the tile
  picker — the rich tile + flyout apply automatically, and the map, rooms, modes
  and consumables are all auto-discovered from the entity's companion
  `camera.*_map` and `select.*` entities (it degrades gracefully for non-Dreame
  vacuums).
- `DashboardView` renders a view's scenes + tile grid; `RoomNav` switches rooms.
- `DetailPanel` flyout — full controls, camera feed, history graph, scenes, links.

### Media & Music Assistant
- **Auto "Now Playing" media view** (`MediaAutoView`, page `kind: 'media'`) —
  automatically lists every media device and shows transport controls only when
  something is actually playing on that device. No manual tile placement needed.
- **Media de-duplication** (`lib/mediaDevices.ts`) — one physical device that
  exposes several `media_player` entities (e.g. an Android TV with ADB + Cast +
  remote) is collapsed to a single entry. The same matching rule feeds the Media
  page, the header subtitle, and the at-a-glance strip so they always agree.
- **Manual merge** — when name heuristics can't tell two entities are the same
  device (abbreviations, possessives), select them in the Media page edit mode
  and **Merge into one**; a badge + split button let you undo. Persists on the
  view (`view.mediaMerge`).
- **Per-page controls (edit mode)** — type-ahead device filter to show/hide
  devices, a **Small / Medium / Large** tile-size selector (fixed-width columns
  so a lone playing tile doesn't span the page), and a toggle for the Music
  Assistant button.
- **Music Assistant search** (`MusicAssistantSearch`) — search the MA library
  (artists, albums, tracks, playlists) from a right-side flyout and tap a result
  to play it on any MA player. Player list is filtered to MA devices via the
  entity registry; a custom dark-theme dropdown stays readable and open while
  choosing; artwork shows by default (opt-out per tile).

### In-app page management
- **PagesManager** — create, rename, re-icon, reorder, and delete pages directly
  in the app, no layout JSON editing by hand.
- **Guided onboarding & empty states** — first-run guidance, friendlier
  empty/loading states, and optimistic toggles (tiles respond instantly and
  reconcile with HA).

### Theming
- 4 themes: **Midnight, Slate, OLED Black, Light** (Settings modal).
- **Accent color** picker (8 swatches + custom). `applyTheme()` sets
  `--accent-orange`, `--accent-primary`, and an **`--accent-rgb` triplet** so the
  accent recolors the entire UI (all `rgba(var(--accent-rgb), …)` usages and
  `color-mix` gradient stops — no more hardcoded orange).

### "Premium feel" polish

**Top picks**
- **Album-art color extraction** — dominant color from now-playing artwork tints
  the media tile/flyout glow (`useArtworkColor` + `colorExtract`).
- **Shared-element artwork → flyout** — media artwork morphs into the flyout via
  the **View Transitions API** (`viewTransition.ts`). The morph *is* the entrance,
  so the spring doesn't double-fire (`vt-active` flag managed by App's `onClose`).
- **Animated media progress bar / equalizer** — interpolated playback position +
  a bouncing EQ badge on playing media tiles.
- **At-a-glance header strip** (`GlanceStrip`) — a row of summary buttons
  (lights on, who's home, climate, media, etc.). **Fully configurable in edit
  mode**: pick each button's metric, set a custom label, toggle its flyout, and
  build a per-button exclude list (tablet/kiosk screen lights are filtered by
  default). Config persists on the view (`view.glance`) so it syncs across
  devices. The header **greeting is dynamic** — it names whoever is actually
  home from the `person.*` states (e.g. "Good night, Jeff & Carissa!"). When
  nobody is home it drops the names entirely and shows just the time-of-day
  greeting ("Good morning").
- **Haptics + spring press** — `lib/haptics.ts` installs one delegated
  `pointerdown` listener firing `navigator.vibrate(8)` on touch/pen taps over
  interactive surfaces (no-op on desktop/mouse). Tiles/pills snap to `scale(0.95–
  0.97)` on `:active`.

**Motion & micro-interactions**
- Spring-physics flyout open (scale + blur-in).
- Staggered tile entrance cascade on view switch (`--enter-i` index, ~28ms steps).
- Animated value transitions — `AnimatedNumber` count-up for temps/weather,
  smooth brightness fills, crossfading album art on track change.

**Living, ambient feel** (`AmbientBackdrop`)
- **Time-of-day ambiance** — `data-tod` (dawn/day/dusk/night) drives a soft-light
  gradient tint, refreshed each minute.
- **Weather-reactive backdrop** — subtle rain streaks / snow flakes driven by the
  weather entity (`weather.forecast_home_2`); nothing renders for clear weather.
- **Live light color** — a light tile's glow matches its real RGB / color-temp.

All animations respect **`prefers-reduced-motion: reduce`**.

---

## Dev preview overrides

`AmbientBackdrop` reads URL query params so ambient effects can be previewed
regardless of real conditions (kept intentionally for tweaking):

| Param                | Values                     | Effect                          |
| -------------------- | -------------------------- | ------------------------------- |
| `?precip=`           | `rain` `snow` `none`       | Force the precipitation layer   |
| `?tod=`              | `dawn` `day` `dusk` `night`| Force the time-of-day tint      |

Example: `http://localhost:3000/?precip=snow&tod=dusk`. No params = real
weather/clock. Particles are suppressed under reduced-motion.

---

## Settings persistence

App settings (HA URL, token, theme, accent) save to **`localStorage`** per
browser/device by default. The dashboard **layout** saves server-side to
`layouts.json` via the Vite middleware — shared across devices on the same host,
and persisted to `/data/layouts.json` when running as the add-on.

**Remember connection on this server** (opt-in) — enabling the toggle in
**Settings → Home Assistant** also stores the URL + token server-side
(`connection.json`, `/data/connection.json` on the add-on). New devices with no
local token automatically adopt it on first load, so tablets/kiosks connect
without pasting the token. It's off by default (token stays per-device); turning
it off clears the stored connection. The file is gitignored and never committed.

---

## Tech stack

- React 19.1, TypeScript ~5.8 (strict), Vite 6
- `home-assistant-js-websocket` for the HA connection
- `@dnd-kit/*` for drag-and-drop editing
- Material Design Icons (`mdi-*` classes)
- Single stylesheet: `src/styles/theme.css`

---

## License

Copyright (c) 2026 Jeff Venuto. All rights reserved. See [LICENSE](./LICENSE).

You may use, modify, and share this project **for free, with attribution** to
the Owner and a link back to this repository. You may **not sell it** or use it
for commercial gain, and derivatives must keep these same terms.

---

## Support

If this dashboard made your home feel a little more premium, you can say thanks:

<a href="https://venmo.com/u/jvenuto" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20beer-%F0%9F%8D%BA-FF8C42?style=for-the-badge" alt="Buy me a beer" /></a>
