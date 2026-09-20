#!/usr/bin/env bash
# Run the tests.
#
#   ./scripts/test.sh          unit + data headless (instant), then the full
#                              suite incl. E2E in headless Chrome
#   ./scripts/test.sh --fast   unit + data only -- use this while iterating
#   SLOW=1 ./scripts/test.sh   also print the twelve slowest tests
#
# No node, no install. The pure tests run in the JavaScriptCore shell that ships
# with macOS; the E2E tests need a real browser because they drive the real app.
set -uo pipefail
cd "$(dirname "$0")/.."

JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; OFF=$'\033[0m'

echo "${BOLD}Content checks${OFF}"
python3 scripts/validate.py || exit 1

echo
echo "${BOLD}Unit + data${OFF} ${DIM}(headless, JavaScriptCore)${OFF}"
if [ -x "$JSC" ]; then
  "$JSC" -m scripts/jsc-run.js || exit 1
else
  echo "${RED}jsc not found${OFF} — open http://localhost:8181/tests/index.html instead"
  exit 1
fi

if [ "${1:-}" = "--fast" ]; then
  echo
  echo "${DIM}skipped E2E (--fast). Drop the flag to run the full suite.${OFF}"
  exit 0
fi

echo
echo "${BOLD}Full suite incl. E2E${OFF} ${DIM}(headless Chrome)${OFF}"
python3 scripts/e2e-headless.py
