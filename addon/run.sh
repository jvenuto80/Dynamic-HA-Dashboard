#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
set -e

# Persist the layout/glance config on the add-on's /data volume so it survives
# restarts and updates. Seed the generic starter template on first run.
LAYOUT_FILE="/data/layouts.json"
if [ ! -f "${LAYOUT_FILE}" ]; then
    bashio::log.info "No saved layout found — seeding generic starter template."
    cp /app/layouts.template.json "${LAYOUT_FILE}"
fi

export LAYOUT_FILE
# Optional shared connection (URL + token) for the opt-in "remember connection
# on the server" toggle. Persisted on /data so all devices can auto-connect.
export CONNECTION_FILE="/data/connection.json"
# Shared (non-credential) app settings synced across devices (issue #8).
export SETTINGS_FILE="/data/settings.json"
export PORT=3000

# Opt-in: serve the stored connection (URL + token) over the direct host port so
# LAN kiosks auto-configure without pasting the token. Trades the ingress-auth
# gate for LAN trust — only enable on a network you control.
if bashio::config.true 'share_connection_on_lan'; then
    export ALLOW_LAN_CONNECTION=1
fi

bashio::log.info "Starting Dynamic HA Dashboard on port ${PORT}…"
if [ "${ALLOW_LAN_CONNECTION:-}" = "1" ]; then
    bashio::log.warning "share_connection_on_lan is ON: the stored HA token is served over the direct port to anyone on this LAN. Only use on a trusted network."
else
    bashio::log.info "Server-side connection storage is ingress-authenticated; to let direct-port kiosks auto-configure, enable 'share_connection_on_lan' (trusted LAN only)."
fi

cd /app
# vite preview serves the built app AND the /layout persistence API.
exec npx vite preview --host 0.0.0.0 --port "${PORT}" --strictPort
