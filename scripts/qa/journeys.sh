#!/bin/bash
# Browser journeys over a real production build, fully self-contained.
#
#   scripts/qa/journeys.sh                 # build + every journey
#   scripts/qa/journeys.sh --no-build      # reuse the existing .next build
#   scripts/qa/journeys.sh security-owasp  # only journeys whose name matches
#
# Starts its OWN Supabase stub and stops it (and any `next start` it left)
# on exit, so nothing has to survive between tool calls or container restarts.
# Prints one summary line per journey; full output goes to $QA_LOG_DIR.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
LOG_DIR="${QA_LOG_DIR:-/tmp/qa-logs}"; mkdir -p "$LOG_DIR"
BUILD=1; FILTER=""
for a in "$@"; do case "$a" in --no-build) BUILD=0 ;; *) FILTER="$a" ;; esac; done

cleanup() {
  [ -n "${STUB_PID:-}" ] && kill "$STUB_PID" 2>/dev/null
  pkill -9 -f "[n]ext start -p 39" 2>/dev/null
  true
}
trap cleanup EXIT

if curl -s -o /dev/null http://127.0.0.1:5555/__stub/db; then
  echo "stub: already running on :5555 — reusing it"
else
  node lib/__qa__/reviewer-journey/supabase-stub.js > "$LOG_DIR/stub.log" 2>&1 &
  STUB_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:5555/__stub/db && break; sleep 0.25; done
fi

if [ "$BUILD" = 1 ]; then
  if NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5555 NEXT_PUBLIC_SUPABASE_ANON_KEY=stub-anon-key \
     SUPABASE_SERVICE_ROLE_KEY=stub-service-key NEXT_PUBLIC_ENABLE_AI_VISIBILITY=true ENABLE_AI_VISIBILITY=true \
     npx next build > "$LOG_DIR/build.log" 2>&1; then echo "build: ok"; else echo "build: FAILED — see $LOG_DIR/build.log"; exit 1; fi
fi

FAIL=0
for j in lib/__qa__/reviewer-journey/*.js; do
  name="$(basename "$j" .js)"
  [ "$name" = "supabase-stub" ] && continue
  [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]] && continue
  QA_SCREENSHOT_DIR="$LOG_DIR/shots-$name" timeout 900 node "$j" > "$LOG_DIR/journey-$name.log" 2>&1
  summary="$(grep -Eo '[0-9]+ passed, [0-9]+ failed' "$LOG_DIR/journey-$name.log" | tail -1)"
  echo "journey $name: ${summary:-NO SUMMARY — see $LOG_DIR/journey-$name.log}"
  [[ "$summary" =~ ^[0-9]+\ passed,\ 0\ failed$ ]] || FAIL=1
  pkill -9 -f "[n]ext start -p 39" 2>/dev/null
done
exit $FAIL
