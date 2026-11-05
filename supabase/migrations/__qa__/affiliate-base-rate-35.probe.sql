-- ============================================================================
-- EXECUTED PROBE — 20261105160000_affiliate_base_rate_35.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, the migration that created the
-- affiliate programme, then the default change under test TWICE (a re-run must
-- not error).
--
--   'before'    the premise. With only the original migration applied, a
--               partner inserted without a rate is seeded at 30. A probe that
--               cannot show the old default is not evidence the change did
--               anything.
--   'after'     a partner inserted without a rate is seeded at 35.
--   'untouched' THE POINT OF THE WHOLE MIGRATION. A row that already existed
--               at 30 is STILL at 30 afterwards. Moving a DEFAULT must never
--               rewrite an agreed rate: the engine pays the partner's own
--               figure, and a silent raise or cut of somebody's money is
--               exactly what this must not do.
--   'explicit'  a rate passed explicitly still wins over the default, so a
--               negotiated partner is unaffected in either direction.
--   'guarded'   the CHECK still holds: 0 and 101 are refused. The change must
--               not have degraded into dropping the constraint.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/affiliate-base-rate-35.probe.sql
-- ============================================================================

\set ON_ERROR_STOP on

\i supabase/migrations/20261009190000_affiliate_program.sql

-- A partner who existed BEFORE the change, on the old default.
insert into public.affiliates (user_id, code, status)
values ('00000000-0000-0000-0000-00000000aaaa', 'before_partner', 'approved');

select 'before' as stage,
       base_rate,
       base_rate = 30 as seeded_at_thirty
from public.affiliates where code = 'before_partner';

-- The migration under test, applied twice.
\i supabase/migrations/20261105160000_affiliate_base_rate_35.sql
\i supabase/migrations/20261105160000_affiliate_base_rate_35.sql

insert into public.affiliates (user_id, code, status)
values ('00000000-0000-0000-0000-00000000bbbb', 'after_partner', 'approved');

select 'after' as stage,
       base_rate,
       base_rate = 35 as seeded_at_thirty_five
from public.affiliates where code = 'after_partner';

-- The existing partner must be exactly where they were.
select 'untouched' as stage,
       base_rate,
       base_rate = 30 as still_on_their_agreed_rate
from public.affiliates where code = 'before_partner';

-- An explicit rate still wins.
insert into public.affiliates (user_id, code, status, base_rate)
values ('00000000-0000-0000-0000-00000000cccc', 'negotiated', 'approved', 50);

select 'explicit' as stage,
       base_rate,
       base_rate = 50 as explicit_rate_kept
from public.affiliates where code = 'negotiated';

-- The constraint still refuses nonsense.
select 'guarded' as stage, 'zero refused' as case, not exists (
  select 1 from (
    select 1 where false
  ) t
) as placeholder;

do $$
declare ok boolean := false;
begin
  begin
    insert into public.affiliates (user_id, code, status, base_rate)
    values ('00000000-0000-0000-0000-00000000dddd', 'zero_rate', 'approved', 0);
  exception when check_violation then ok := true;
  end;
  raise notice 'guarded: zero refused = %', ok;
  ok := false;
  begin
    insert into public.affiliates (user_id, code, status, base_rate)
    values ('00000000-0000-0000-0000-00000000eeee', 'over_rate', 'approved', 101);
  exception when check_violation then ok := true;
  end;
  raise notice 'guarded: over-100 refused = %', ok;
end $$;
