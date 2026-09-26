#!/bin/bash
# Run a supabase/migrations/__qa__/*.probe.sql against a DISPOSABLE PostgreSQL
# cluster that this script creates and destroys. Never touches Supabase.
#
#   scripts/qa/pg-probe.sh supabase/migrations/__qa__/owasp-hardening.probe.sql
#
# initdb refuses to run as root, so the cluster belongs to an unprivileged
# user (created on first use). Prints only the probe's summary line and any
# FAIL rows; the full output goes to $QA_LOG_DIR.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
PROBE="${1:?usage: scripts/qa/pg-probe.sh <probe.sql>}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -x "$PGBIN/initdb" ] || { echo "PostgreSQL binaries not found under /usr/lib/postgresql"; exit 1; }
LOG_DIR="${QA_LOG_DIR:-/tmp/qa-logs}"; mkdir -p "$LOG_DIR"
id pgprobe >/dev/null 2>&1 || useradd -m pgprobe
DIR="$(mktemp -d /tmp/pgprobe.XXXXXX)"; chown pgprobe "$DIR"; chmod 755 "$DIR"
PORT="${PGPROBE_PORT:-55460}"
cleanup() { su pgprobe -c "$PGBIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
su pgprobe -c "$PGBIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
su pgprobe -c "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start" >/dev/null
OUT="$LOG_DIR/probe-$(basename "$PROBE" .sql).log"
psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -f "$PROBE" > "$OUT" 2>&1 || { echo "probe errored — see $OUT"; tail -5 "$OUT"; exit 1; }
grep -E "FAIL" "$OUT" | head -20 || true
grep -Eo '[0-9]+ passed, [0-9]+ failed' "$OUT" | tail -1
grep -Eq '[0-9]+ passed, 0 failed' "$OUT"
