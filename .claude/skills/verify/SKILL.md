---
name: verify
description: Verify a change in this repo before committing or pushing — typecheck, ESLint on touched lines, all QA suites (failures auto-classified against origin/main), optional browser journeys and DB probes. Use after any code change and before every push; prefer it over running tsc/eslint/suites by hand.
---

# Verify a change (short report, full logs on disk)

Run these instead of invoking tsc / eslint / `npx tsx <suite>` one by one. They print a few
lines; full output is in `/tmp/qa-logs/` — open a log only when a line says to.

1. **Always:** `node scripts/qa/verify.mjs`
   - `tsc: N error(s)` — baseline is **0**.
   - `eslint (touched lines)` — must be **0 findings** (repo-wide count ~374 is pre-existing; ignore it).
   - `qa suites: X/Y clean` — each failure is labelled **PRE-EXISTING** (identical on origin/main,
     checked automatically) or **NEW**. Only NEW failures block. Exit code is non-zero only for NEW.
   - Faster loops: `--quick` (tsc + lint only), `--only <path>` (suites under a path).
2. **If the change touches pages, routes, auth, billing, Shopify or the automation cron:**
   `scripts/qa/journeys.sh` (builds, starts its own Supabase stub, runs every journey, cleans up).
   `--no-build` to reuse `.next`; pass a name fragment to run one journey (e.g. `security-owasp`).
3. **If the change adds or edits a migration:** write/extend a `supabase/migrations/__qa__/*.probe.sql`
   that runs each attack BEFORE and AFTER `\i` of the migration, then
   `scripts/qa/pg-probe.sh <probe.sql>` (disposable local cluster; never Supabase).

Rules that still apply:
- A guard/check must have a mutation control (it must fail on the vulnerable/old shape).
- Report numbers from these commands, not from memory. Do not claim success on NEW failures.
- Never run `playwright install`; the browser is at `/opt/pw-browsers/chromium`.
