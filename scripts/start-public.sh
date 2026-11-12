#!/usr/bin/env bash
# Open a temporary public HTTPS URL for the game using Cloudflare's quick tunnel.
# This only works on a network that can reach the Cloudflare edge (a normal home
# or cloud machine). It does not need a Cloudflare account.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3847}"
if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
  echo "Starting the game server on port ${PORT}..."
  node server/index.js &
  sleep 1
fi
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Install cloudflared first: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
  exit 1
fi
echo "Requesting a temporary public URL. It lasts only while this process stays running."
exec cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate
