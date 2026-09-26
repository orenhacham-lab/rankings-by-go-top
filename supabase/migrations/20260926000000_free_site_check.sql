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
