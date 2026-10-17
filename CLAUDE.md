# rankings-by-go-top — notes for Claude

Keep this file short. It replaces the per-session "handoff" re-explanation.

## Stack (the parts that bite)
- Next.js 16 App Router. `proxy.ts` is the middleware and its matcher **excludes `/api/*`** — every API route must authenticate itself.
  - Users: `requireAdminApi` (`lib/auth/require-admin.ts`) / `isAdminUser` (`lib/auth/admin-role.ts`).
  - Crons: `authorizeCronRequest` (`lib/auth/cron.ts`), which fails closed.
- Supabase with RLS. `createAdminClient()` (service role) **bypasses RLS**, so filter by the owner explicitly whenever you use it.
- Shopify surfaces are English-only. Locale logic is in `lib/i18n/`, guarded by `lib/i18n/__qa__/server-language-contract.qa.ts` and `shopify-english-journey.qa.ts`.
- Shopify billing: `lib/shopify/billing-guard.ts` checks admin **first**, then the Shopify plan.
- Vercel auto-deploys `main`. Crons (UTC):
  - GSC at 05:00
  - schedule at 06:00
  - automation at 07:00
  - cron-job.org also calls `/api/content/automation/cron` every 15 minutes with `Authorization: Bearer <CRON_SECRET>`. The route answers 202 and does the work in `after()`.
- IDs:
  - Vercel project `prj_ScaRKNPGBFmvAbiqqpi9o9Ew1QXg`, team `team_17MAi6RPwIGabHbftYT7xuSY`
  - Supabase `pmzicbtulloeynsosseh`

## Standing rules
- Don't merge or deploy unless the user says so explicitly. One focused PR per task.
- Never modify Production data, billing, subscriptions, plans, prices, quotas, Shopify settings, or reviewer data.
- No reviewer-only bypasses and no hard-coded reviewer ids. Never show raw provider errors to merchants. Never allow an external `next` URL.
- Prove the root cause before fixing. Compare every failure against clean `origin/main`.
- Run and own all verification; don't ask the user to test what can be automated.
- Never paste secrets, and never ask the user to paste tokens in chat.

## Verify (use these, not ad-hoc commands; they print ~10 lines)
- `node scripts/qa/verify.mjs` runs:
  - tsc
  - ESLint on lines touched vs origin/main
  - every `*.qa.ts`

  Failures are auto-classified PRE-EXISTING or NEW against a cached main worktree, and the command exits 1 only on NEW. Options: `--quick`, `--only <path>`. Logs are in `/tmp/qa-logs`.
- `bash scripts/qa/journeys.sh [--no-build] [name]` runs the browser/HTTP journeys over `next start` plus the Supabase stub. It manages the stub itself.
- `bash scripts/qa/pg-probe.sh <file.probe.sql>` runs the probe in a disposable local Postgres. Use it for migrations.
- Skills: `/verify` (what to run when) and `/prod-health` (production checks without huge log dumps).
- Baselines:
  - tsc: 0 errors
  - lint on touched lines: 0
  - known failing suites are reported PRE-EXISTING automatically; don't re-investigate them unless they turn NEW

## QA conventions
- Suites are `*.qa.ts`, run with `npx tsx`, print `N passed, M failed`, and end with `export {}`. Use `FakeAdmin` from `lib/__qa__/_fake-admin`.
- Source guards strip comments before matching.
- Every guard gets a **mutation control**: break the code on purpose and show that the guard fails.
- Journeys live in `lib/__qa__/reviewer-journey/*.js`. The stub on :5555 exposes `/__stub/reset|db|requests`; `STUB_SLOW_TABLE`/`STUB_SLOW_MS` add latency.

## Environment gotchas (cloud sessions)
- The SessionStart hook runs `npm install` (≈1 s warm). Never run `playwright install`, because Chromium is at `/opt/pw-browsers`. `playwright-core` is a devDependency.
- The egress proxy blocks `*.vercel.app`, `gotopseo.com` and `api.cron-job.org`. Check production through the Vercel/Supabase MCP tools (see `/prod-health`).
- Vercel runtime logs: always use `group_by`, or `query` with `limit ≤ 5`. The runner logs a pool only when it acts on it or the pool fails, and counts idle pools in one `[automation-runner] idle pools` line.
- Commit trailer and PR attribution: follow the session's system reminder.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
