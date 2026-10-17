-- ============================================================================
-- A MULTI-SITE ACCOUNT DECIDES HOW ITS MONTHLY ARTICLES ARE SPLIT.
--
-- WHY. The article allowance is the account's, not the site's (Premium 50 a
-- month over up to 10 websites, Agency 200 over up to 100). Until now the
-- scheduler split it evenly between the account's active queues, which is the
-- right default and the only sensible answer with no further information: an
-- agency's main website and the small site it took on last week got the same
-- share. The owner asked for the split to be the customer's to set (4 October
-- 2026), with the even split as the default.
--
--   article_pools.monthly_share   how many of the account's monthly articles
--                                 THIS website should get.
--                                 NULL — the default, and what every existing
--                                 row keeps — means "the even split", exactly
--                                 today's behaviour. Nothing changes for any
--                                 account until a number is written here.
--
-- WHAT THIS IS NOT. It is not a cadence: the days, the times and the ceiling of
-- one article per working day stay with the plan and are never the customer's
-- (lib/content/automation/schedule.ts, plan-rhythm.ts). A number here says how
-- MUCH a site gets, and the scheduler derives the rhythm from it, so this does
-- not reopen what the owner closed on 4 October.
--
-- The check is only that a share is a positive count. The real limits — the sum
-- not exceeding the account's allowance, and no site above what one article a
-- working day can publish — depend on the account's plan and on how many sites
-- are active, which the database cannot see; they are enforced on the write
-- path and guarded there.
--
-- SAFE TO RE-RUN. Additive and idempotent: one nullable column and one check,
-- no default, no backfill, no row rewritten, no policy or grant touched. The
-- table's existing RLS already scopes every row to its owner, and row-level
-- policies cover a new column without change.
--
-- Probe: bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/article-pool-monthly-share.probe.sql
-- ============================================================================

alter table public.article_pools
  add column if not exists monthly_share integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.article_pools'::regclass
      and conname = 'article_pools_monthly_share_positive'
  ) then
    alter table public.article_pools
      add constraint article_pools_monthly_share_positive
      check (monthly_share is null or monthly_share > 0);
  end if;
end $$;

comment on column public.article_pools.monthly_share is
  'How many of the account''s monthly articles this website gets. NULL = the even split between the account''s active queues (the default).';
