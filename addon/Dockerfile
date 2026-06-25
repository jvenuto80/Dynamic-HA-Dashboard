# ── Stage 1: build the static dashboard ───────────────────────────────────
# BUILD_FROM is supplied by the HA Supervisor (see build.yaml). Declared here
# in the global scope so it can be used in the second stage's FROM.
ARG BUILD_FROM=ghcr.io/hassio-addons/base:stable

FROM node:20-alpine AS build

# Clone + build the dashboard from the public repo so this add-on folder stays
# self-contained (HA builds add-ons with the add-on folder as the context).
ARG DASHBOARD_REPO=https://github.com/efimofline/Dynamic-HA-Dashboard.git
ARG DASHBOARD_REF=main

RUN apk add --no-cache git
WORKDIR /build
# Cache-bust: this file's content changes whenever DASHBOARD_REF moves, so Docker
# invalidates the clone layer below and Update reliably rebuilds from latest source
# (without this, the cached `git clone` layer would serve stale code on Update).
ADD https://api.github.com/repos/efimofline/Dynamic-HA-Dashboard/commits/${DASHBOARD_REF} /tmp/dashboard-head.json
RUN git clone --depth 1 --branch "${DASHBOARD_REF}" "${DASHBOARD_REPO}" . \
    && npm ci \
    && npm run build

# ── Stage 2: runtime (HA add-on base) ──────────────────────────────────────
FROM ${BUILD_FROM}

# Node + a static server (vite preview also serves the /layout persistence API).
RUN apk add --no-cache nodejs npm

WORKDIR /app

# Bring over the built app + the bits needed to run `vite preview`
COPY --from=build /build/dist ./dist
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/vite.config.ts ./vite.config.ts
COPY --from=build /build/vite-layout-plugin.ts ./vite-layout-plugin.ts
COPY --from=build /build/node_modules ./node_modules

# Generic starter layout, seeded into /data on first run if none exists.
COPY layouts.template.json /app/layouts.template.json

COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
