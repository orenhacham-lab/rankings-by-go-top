-- The published affiliate commission becomes 35%, so the table's default must
-- become 35 too.
--
-- WHY A DEFAULT MATTERS HERE AT ALL. A partner row carries its own base_rate
-- and the commission engine reads that row, never lib/affiliate/terms.ts. The
-- default is what a row gets when an application is approved without an
-- explicit rate, which is the ordinary path. Leaving it at 30 while the public
-- page offers 35 would mean every new partner silently joined on a rate lower
-- than the one they were shown — the exact mismatch the constants file was
-- written to prevent.
--
-- WHY 35, across three channels. The commission a partner is offered differed
-- by where they found us: this programme said 30, JVZoo pays 35 on the first
-- payment and 30 on renewals, and Digistore24 pays 35. A partner who saw two of
-- them saw two different offers. 35 everywhere, decided 2026-11-05.
--
-- SCHEMA ONLY, AND DELIBERATELY SO. This changes what a FUTURE row defaults to
-- and touches no existing row. The one approved partner on the table today
-- still carries 30, which is a commercial term agreed with a third party and
-- not something a migration should rewrite on its own.
--
-- top_rate stays 40: it is the rate from top_rate_from active paying referrals
-- onwards, and the CHECK constraint affiliates_rates requires top_rate >=
-- base_rate, which 40 >= 35 satisfies.

ALTER TABLE public.affiliates
  ALTER COLUMN base_rate SET DEFAULT 35;
