#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# The web container is reclaimed between sessions and `node_modules` has been
# found empty after restarts (tsc then reported ~15k phantom errors). Claude
# Code caches the container state after this hook completes, so installing
# here makes the dependencies part of the cached image: later sessions start
# with them present and `npm install` is a fast no-op.
#
# playwright-core (browser journeys) is a pinned devDependency, so it arrives
# with the rest; the browser itself is preinstalled at /opt/pw-browsers and is
# never downloaded (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# `npm install` (not `npm ci`): it reuses a cached node_modules instead of
# deleting it, which is what makes the cached container worth having.
npm install --no-audit --no-fund --loglevel=error

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "$CLAUDE_ENV_FILE"
fi
