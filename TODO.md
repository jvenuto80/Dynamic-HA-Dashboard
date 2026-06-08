# HA Dashboard — TODO

## Settings persistence (decide later)

Currently app settings (HA URL, long-lived token, theme, accent) save to
**`localStorage`** (`src/settings.ts`). That's per-browser/per-device only.

> **Done (0.9.3-beta):** opt-in **Remember connection on this server** now syncs
> the URL + token server-side (`connection.json` / `/data/connection.json`) so
> new devices auto-connect. Off by default. The remaining items below are about
> syncing theme/accent too.

Options if we want the rest of the settings to follow across devices:

- [ ] **Server-side `settings.json`** ([#7](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/7)) — reuse the existing `/layout` Vite
  middleware pattern (`vite-layout-plugin.ts` + `layouts.json`). No new
  dependency. Syncs across all devices/browsers.
  - ⚠️ Caveat: the long-lived token would be written to disk in plaintext on
    the host. Fine on a private LAN, but a conscious decision.
  - Possible compromise: sync only theme/accent/URL via `settings.json`, keep
    the **token in `localStorage`** so it never hits disk.
- [ ] **Store settings in Home Assistant itself** ([#8](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/8)) — survives + syncs, more work.
- [ ] SQLite — **not worth it** for ~4 fields of flat prefs (decided against).

Decision: leaving as `localStorage` for now since it works on a single device.

## Theming follow-ups

- [x] ~~Accent color drives `--accent-orange` / `--accent-primary`, but some older
  styles use hardcoded orange `rgba(...)` values that won't recolor. Sweep
  those to use the CSS variable so the accent applies everywhere.~~ Added an
  `--accent-rgb` triplet (set in `applyTheme`) and converted the literal
  `rgba(255, 107, 53, …)` / `#ff8c42` accent values in `theme.css` to
  `rgba(var(--accent-rgb), …)` / `color-mix` so the chosen accent recolors fully.

## Features

- [x] ~~**Music Assistant "play media" tile**~~ — a control like the one on
  `home.djphoria.com/lovelace/4`: pick a speaker/target media_player, then
  search & pick something to play via Music Assistant. **Done (0.9.8.0):**
  `MusicAssistantSearch` flyout searches the MA library and taps-to-play on any
  MA player (filtered via the entity registry); see also the auto "Now Playing"
  media view (0.9.9.0) with de-dup + manual merge + tile-size options.
- [x] ~~**Add pages from edit mode**~~ — in edit mode, allow creating additional
  pages in the left navigation panel (add/rename/reorder/remove views), not just
  editing tiles within an existing page. **Done (0.9.6.0):** in-app
  `PagesManager` (create, rename, re-icon, reorder, delete).

## Deployment

- [x] ~~**Ship as a Home Assistant Add-on (Option B)**~~ — runs as a
  Supervisor-managed add-on via Ingress. Scaffolding lives in [`addon/`](addon/):
  `config.yaml` (ingress, `ingress_port: 3000`, sidebar panel), `build.yaml`
  (per-arch `ghcr.io/hassio-addons/base`), `Dockerfile` (multi-stage: clones +
  `npm run build`, runtime runs `vite preview`), `run.sh` (bashio startup, seeds
  the generic starter template into `/data/layouts.json` on first run, exports
  `LAYOUT_FILE`/`PORT`), plus `README.md`/`CHANGELOG.md`. Root `repository.yaml`
  registers the add-on repo.
  - **Token: user-entered, never baked** — added via the in-app **Settings** UI
    (`localStorage`), never written to disk or into the image.
  - Vite `base: './'` + `BASE_URL`-relative `/layout` fetch + `preview.host`/
    `allowedHosts: true` so assets and the persistence API work behind Ingress.
  - `vite-layout-plugin.ts` honors `LAYOUT_FILE` so layouts persist on `/data`.
  - **Layout export/import** — Settings → Dashboard data has **Export layout**
    (downloads all views/tiles/glance config as JSON) and **Import layout** so
    an existing dashboard can be moved onto a fresh deploy without rebuilding.
    `useLayout` exposes `exportLayout()` / `importLayout()`. (Personal layout
    backup captured locally for redeploy.)
- [ ] **Automate template/layout backups via HA automations** ([#9](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/9)) — provide a way to
  schedule recurring backups of the layout (`layouts.json` / the export JSON)
  driven by Home Assistant automations (e.g. a REST command or service the
  add-on exposes that an HA automation can call on a schedule), so the dashboard
  config is snapshotted automatically without manual Export. Document the
  example automation in the wiki.
- [x] **Glance button exclusions should be global per button type, not per page.**
  ([#10](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/10))
  Right now the "at a glance" exclude list (e.g. which `light.*` entities don't
  count toward **lights on**) is stored per view (`view.glance`), so excluding a
  tablet/kiosk light on one page doesn't carry to other pages that use the same
  button. Make a button's exclusions consistent across every page that uses that
  button type — e.g. store exclusions keyed by button metric/type at the layout
  level and have per-view glance configs reference them, so the count is the same
  everywhere. **Done:** exclusions are now global per metric — `useLayout`
  derives a union of each button's `exclude` keyed by metric and editing one
  writes it to every button of that metric on every page.

## High-end polish ideas

> Brainstorm of "premium feel" enhancements. Ordered roughly by wow-per-effort.

### Top picks (biggest impact)

- [x] ~~**Album-art color extraction**~~ — pull the dominant color from now-playing
  artwork and tint the media tile/flyout glow to match (Apple Music style).
- [x] ~~**Shared-element artwork → flyout**~~ — media tile artwork "expands" into the
  flyout artwork via the View Transitions API.
- [x] ~~**Animated media progress bar / equalizer**~~ on playing media tiles.
- [x] ~~**Haptics + spring press** — `:active { scale: 0.97 }` + `navigator.vibrate(8)`
  so taps feel physical.~~
- [x] ~~**"At a glance" header strip**~~ — active lights count, indoor temp, who's
  home, next calendar event. Now fully **user-configurable** in edit mode: pick
  which metric each button shows (lights/switches/fans/locks/covers/climate/
  people/media), set a custom label, toggle the flyout on/off, and build a
  per-button exclude list (tablet/kiosk screen `light.*` entities are filtered
  by default). Flyouts are dynamic to the button — toggleable metrics render a
  2–3 column grid of pushable toggles (light groups collapse to a single toggle
  while the count still reflects individual lights on); non-toggle metrics list
  rows that open the detail panel. Config persists on the view (`view.glance`)
  so it syncs across devices.

### Motion & micro-interactions

- [x] ~~Spring-physics flyout open (scale + blur-in) instead of instant swap.~~
- [x] ~~Staggered tile entrance (20–30ms cascade) on view switch.~~
- [x] ~~Animated value transitions — count-up temps, smooth brightness fills,
  crossfading album art on track change.~~

### Living, ambient feel

- [x] ~~Time-of-day ambiance — warm gradient at night, cool in morning (drive from
  `sensor.time_based_color_temp`).~~
- [x] ~~Weather-reactive backdrop — subtle particle layer tied to weather entity.~~
  Added lightning flashes during thunderstorms (`?precip=storm` / `?storm=1`
  preview) and an "Ambient effects" on/off toggle in Settings → Appearance.
- [x] ~~Live light color — a light tile's glow matches its real RGB/kelvin.~~
- [x] ~~Dynamic greeting — the header now greets whoever is actually home based on
  the `person.*` states ("Good night, Jeff & Carissa!" / just one name / no name
  when nobody's home), in config order.~~

### Depth & materials

- [ ] Layered parallax glass — slight pointer-tracking 3D tilt on tiles. ([#11](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/11))
- [ ] Specular highlight — faint moving sheen across glass cards on hover. ([#12](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/12))
- [ ] Better elevation — multi-layer shadows + inner highlight stroke. ([#13](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/13))

### Information density, done elegantly

- [x] ~~Compact sections — flow whole sections into a responsive masonry so short
  sections sit side-by-side and fill the screen width (keeping section headings)
  instead of leaving tall vertical gaps. On by default; toggle in
  Settings → Appearance.~~
- [ ] Sparklines on more tiles (climate/sensor) using the existing `Sparkline`. ([#14](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/14))
- [ ] Quiet status dots that pulse only on change. ([#15](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/15))
- [ ] Smart grouping — collapse an idle room into one tile, expand on tap. ([#16](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/16))

### Delightful extras

- [ ] Scene transition flash — quick full-screen color wash matching the scene. ([#17](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/17))
- [ ] Now-playing lock-screen mode — full-bleed album art takeover on tap. ([#18](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/18))
- [ ] Voice/Assist floating mic button into HA Assist. ([#19](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/19))
- [ ] Idle "screensaver" — drift to clock + ambient art for wall-tablet use. ([#20](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/20))
- [ ] Pull-to-refresh with a custom elastic indicator. ([#21](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/21))

### Performance polish (makes it *feel* premium)

- [ ] 60fps everything — GPU-only transforms, `will-change` hints, no layout thrash. ([#22](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/22))
- [x] ~~Optimistic UI everywhere — toggles reflect instantly before HA confirms.~~
  **Done (0.9.7.0):** tiles respond immediately and reconcile with HA state.
- [ ] Skeleton shimmer on first load instead of empty tiles. ([#23](https://github.com/jvenuto80/Dynamic-HA-Dashboard/issues/23))

