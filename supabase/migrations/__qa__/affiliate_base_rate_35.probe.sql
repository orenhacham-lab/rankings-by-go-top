-- Proves 20261105170000_affiliate_base_rate_35.sql does what it claims and
-- nothing else: a NEW row defaults to 35, an EXISTING row is untouched, and the
-- affiliates_rates CHECK still accepts the pair 35/40 while refusing a top rate
-- below the base rate.
--
-- Run: bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/affiliate_base_rate_35.probe.sql
-- Result at time of commit: 6 passed, 0 failed.
--
-- MUTATION CONTROL: with the ALTER changed back to 30 this probe reports
-- 3 passed, 3 failed, so it is testing the migration and not merely the
-- table it builds for itself.

-- A cut-down affiliates table carrying the three rate columns and the
-- constraint the migration has to live with. The real table has more columns;
-- none of them bear on a default.
CREATE TABLE public.affiliates (
  id             serial PRIMARY KEY,
  code           text,
  base_rate      numeric(5,2) NOT NULL DEFAULT 30,
  top_rate       numeric(5,2) NOT NULL DEFAULT 40,
  top_rate_from  integer      NOT NULL DEFAULT 10,
  CONSTRAINT affiliates_rates CHECK (base_rate > 0 AND base_rate <= 100 AND top_rate >= base_rate AND top_rate <= 100 AND top_rate_from >= 1)
);

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- A partner who joined before the change, on the old rate.
INSERT INTO public.affiliates (code) VALUES ('before');

SELECT chk('before', 'a partner on the old programme carries 30',
  (SELECT base_rate FROM public.affiliates WHERE code = 'before') = 30);

-- ── the migration under test ────────────────────────────────────────────────
ALTER TABLE public.affiliates
  ALTER COLUMN base_rate SET DEFAULT 35;
-- ────────────────────────────────────────────────────────────────────────────

-- A partner who joins after it.
INSERT INTO public.affiliates (code) VALUES ('after');

SELECT chk('after', 'a partner approved after the change gets 35',
  (SELECT base_rate FROM public.affiliates WHERE code = 'after') = 35);

SELECT chk('after', 'the existing partner was NOT rewritten',
  (SELECT base_rate FROM public.affiliates WHERE code = 'before') = 30);

SELECT chk('after', 'the column default reads 35',
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'affiliates' AND column_name = 'base_rate') LIKE '35%');

SELECT chk('after', 'top_rate was left alone at 40',
  (SELECT top_rate FROM public.affiliates WHERE code = 'after') = 40);

-- The CHECK constraint must still refuse a top rate below the new base rate.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.affiliates (code, top_rate) VALUES ('check-bad', 34);
    PERFORM chk('constraint', 'a top rate below the base rate is refused', false);
  EXCEPTION WHEN check_violation THEN
    PERFORM chk('constraint', 'a top rate below the base rate is refused', true);
  END;
END $$;

SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;
