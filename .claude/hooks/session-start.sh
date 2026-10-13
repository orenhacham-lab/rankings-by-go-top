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

# The web container clones shallow (57 commits on 2026-10-12). Several guards
# read history older than that — the released plugin at a tag, the diff that
# proves a change touched no billing file — and a missing object makes them
# report a FAILURE, not a skip. They then fail identically on main, so
# verify.mjs files them as PRE-EXISTING and they are never looked at again.
# Deepening here puts the full history in the cached container, so it costs
# nothing in later sessions. Never fatal: without it the guards behave as
# before.
if [ -f .git/shallow ]; then
  git fetch --unshallow --quiet origin || echo 'session-start: could not deepen the clone; history-dependent guards may report failures' >&2
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "$CLAUDE_ENV_FILE"
fi
