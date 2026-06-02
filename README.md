# HA Dashboard

A custom, high-polish Home Assistant dashboard built with **React 19 + TypeScript +
Vite**. It talks directly to Home Assistant over its WebSocket API, renders a
fully editable tile/room layout, and layers on a lot of "premium feel" motion and
ambient effects.

> Companion file: [TODO.md](./TODO.md) tracks remaining ideas and decisions.

---

## Screenshots

|  |  |
|---|---|
| ![Main dashboard](screenshots/01-main.png) | ![Now-playing flyout](screenshots/20-flyout-media.png) |
| **Main dashboard** — editable tile/room layout | **Media flyout** — now-playing artwork, scrubber, transport |
| ![Light flyout](screenshots/21-flyout-light.png) | ![Edit mode](screenshots/30-edit-mode.png) |
| **Light flyout** — brightness, color, live glow | **Edit mode** — drag-and-drop tile arrangement |
| ![Settings](screenshots/40-settings.png) | ![Ambient — rain](screenshots/50-ambient-rain.png) |
| **Settings** — themes, accent color, connection | **Ambient backdrop** — weather-reactive rain |
| ![Ambient — snow](screenshots/51-ambient-snow.png) | ![Ambient — night](screenshots/52-ambient-night.png) |
| **Ambient backdrop** — snow particles | **Ambient backdrop** — night time-of-day tint |
| ![Ambient — dusk](screenshots/53-ambient-dusk.png) | ![Ambient — rain at night](screenshots/54-ambient-rain-night.png) |
| **Ambient backdrop** — dusk gradient | **Ambient backdrop** — rain + night combined |

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

---

## Architecture

```
src/
  main.tsx            App bootstrap: applyTheme(), installHaptics()
  App.tsx             Top-level shell: sidebar, header, views, detail flyout
  config.ts           Static catalogs: HA_URL/TOKEN, scenes[], persons[]
  settings.ts         App settings (localStorage) + applyTheme()
  types.ts            Shared layout / entity types

  hooks/
    useHomeAssistant.ts  WebSocket connection, entity state, callHA, history/forecast
    useLayout.ts         Loads/saves the dashboard layout (views, rows, tiles)
    useArtworkColor.ts   Extracts a dominant color from now-playing artwork

  lib/
    layout.ts          viewRows() and layout helpers
    tileSize.ts        Tile span/size logic
    colorExtract.ts    Canvas-based dominant-color extraction
    viewTransition.ts  View Transitions API wrapper (shared-element morphs)
    haptics.ts         navigator.vibrate + delegated press listener
    entityInfo.ts      Per-domain display helpers

  components/          One component per surface (see Features below)
  styles/theme.css     All styling + animations (single stylesheet)

vite-layout-plugin.ts  Dev/preview middleware: GET/POST/DELETE /layout → layouts.json
layouts.json           Persisted custom layout (shared across devices)
```

### Data flow

- `useHomeAssistant` opens the WS connection, subscribes to entity states, and
  exposes `entities`, `connected`, `error`, `callHA(domain, service, …)`,
  `getForecast`, and `getHistory`.
- `useLayout` loads the editable layout from `/layout` (falls back to a default),
  and writes changes back via the Vite middleware to `layouts.json`.
- `App` resolves the active view, renders its scenes + tiles, and owns the
  `DetailPanel` flyout (entity controls, camera, history, links, quick actions).

---

## Features

### Layout & editing
- **Multiple views/pages** with a left **Sidebar** + **RoomNav**.
- **Edit mode** — drag-and-drop tiles (`@dnd-kit`), add/remove tiles, add/reorder/
  remove scenes per view, reset to defaults. Saved to `layouts.json` (syncs across
  devices on the same host).
- **Per-tile settings** (`TileSettings`) — camera entity, links, quick actions,
  flyout config, reverse slider, custom artwork entity, tile size/span.

### Tiles & cards
- `DeviceTile` — lights, switches, media players, covers, locks, buttons, etc.
  with slide-to-dim, live artwork backgrounds, and per-domain controls.
- `ClimateCards`, `LockCards`, `VacuumCard`, `CameraGrid`, `SensorWidgets`,
  `RoomCard` / `RoomPanel`, `PersonTracker`, `Sparkline`.
- `DetailPanel` flyout — full controls, camera feed, history graph, scenes, links.

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
- **At-a-glance header strip** (`GlanceStrip`) — active light count, indoor temp,
  who's home, media playing; omits stats with no data.
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

App settings (HA URL, token, theme, accent) currently save to **`localStorage`**
(per browser/device). The dashboard **layout** saves server-side to
`layouts.json` via the Vite middleware (shared across devices). See
[TODO.md](./TODO.md) for the cross-device settings options under consideration.

---

## Tech stack

- React 19.1, TypeScript ~5.8 (strict), Vite 6
- `home-assistant-js-websocket` for the HA connection
- `@dnd-kit/*` for drag-and-drop editing
- Material Design Icons (`mdi-*` classes)
- Single stylesheet: `src/styles/theme.css`
