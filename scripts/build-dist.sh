#!/usr/bin/env bash
# Build a clean folder to deploy to a static host.
#
#   ./scripts/build-dist.sh        -> dist/
#
# Use this rather than dragging the project folder itself: the project contains
# a TLS PRIVATE KEY (.certs/, for the --https dev server) that must never reach
# a public host. This copies only what the app needs to run.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Checking content and regenerating the offline manifest..."
python3 scripts/gen-sw-manifest.py
python3 scripts/validate.py

rm -rf dist
mkdir -p dist

# exactly what the app needs, nothing else
for item in index.html manifest.json sw.js sw-assets.json css js data audio assets; do
  cp -R "$item" dist/
done
touch dist/.nojekyll          # GitHub Pages: do not run Jekyll over these files

# belt and braces: nothing secret may ride along
if find dist -name '*.key' -o -name '*.crt' -o -name '*.pem' | grep -q .; then
  echo "REFUSING: a certificate or key ended up in dist/" >&2
  exit 1
fi

echo
echo "dist/ ready — $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1)"
echo "Deploy the CONTENTS of dist/ (not the project folder)."
