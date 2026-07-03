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

bashio::log.info "Starting Dynamic HA Dashboard on port ${PORT}…"
bashio::log.info "Server-side connection storage is ingress-authenticated; if you publish the optional host port, only expose it on a trusted network."

cd /app
# vite preview serves the built app AND the /layout persistence API.
exec npx vite preview --host 0.0.0.0 --port "${PORT}" --strictPort
