-- Free public site check: one ledger row per run.
--
-- The same table serves three jobs deliberately, so the public route needs a
-- single round trip for each of them and no separate counters can drift:
--   * cache        — the newest row for (domain, locale) inside 24h is replayed
--                    instead of re-scanning and re-paying for a model call;
--   * rate limit   — rows per hashed client over a short window;
--   * cost ceiling — rows with ai_used = true since midnight UTC.
--
-- No raw IP is stored. `client_hash` is a salted SHA-256 the application
-- computes; it is one-way and only ever compared against itself.
--
-- RLS is enabled with NO policies and privileges are revoked from anon and
-- authenticated: nothing but the service-role client may read or write this
-- table. That matters because the rows describe third-party websites that
-- visitors typed in, and because a readable rate-limit ledger is a rate limit
-- an attacker can plan around.

create table if not exists public.free_site_checks (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  locale text not null,
  url text not null,
  result jsonb not null,
  ai_used boolean not null default false,
  client_hash text not null,
  created_at timestamptz not null default now()
);

-- Cache lookup: newest run for this domain + locale.
create index if not exists free_site_checks_domain_locale_idx
  on public.free_site_checks (domain, locale, created_at desc);

-- Rate limiting: recent runs by this client.
create index if not exists free_site_checks_client_idx
  on public.free_site_checks (client_hash, created_at desc);

-- Daily model-spend ceiling: only rows that actually spent a call.
create index if not exists free_site_checks_ai_used_idx
  on public.free_site_checks (created_at desc)
  where ai_used;

alter table public.free_site_checks enable row level security;

revoke all on public.free_site_checks from anon, authenticated;

-- ── claim tokens ────────────────────────────────────────────────────────────
--
-- A visitor who scans a site and then opens an account should get THAT scan
-- seeded into their first project. Looking the scan up by domain at signup
-- would hand a stranger's account whatever scan happened to be cached for the
-- domain they typed, so the handoff is a capability instead: each response
-- carries a fresh random token, and this table is the one row that redeems it.
--
-- One row per RESPONSE, not per scan, because a cached scan is replayed to
-- several visitors and each of them needs their own one-time claim. The token
-- itself is never stored — only its SHA-256 — so a leaked table grants nothing.
-- `consumed_at` makes redemption single-use; the 24h validity is enforced by
-- the reader against `created_at`, matching the cache TTL above.

create table if not exists public.free_site_check_claims (
  token_hash text primary key,
  check_id uuid not null references public.free_site_checks(id) on delete cascade,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

-- Redemption reads by token_hash (the primary key); this index serves the
-- cascade and lets a scan's outstanding claims be found.
create index if not exists free_site_check_claims_check_idx
  on public.free_site_check_claims (check_id, created_at desc);

alter table public.free_site_check_claims enable row level security;

revoke all on public.free_site_check_claims from anon, authenticated;
