#!/usr/bin/env bash
# Serve the app with caching disabled.
#   ./scripts/serve.sh            http  (microphone works on localhost only)
#   ./scripts/serve.sh --https    https (needed for the microphone on the iPad)
# Open the printed iPad address in Safari, then Share > Add to Home Screen.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/serve.py "${PORT:-8181}" "$@"
