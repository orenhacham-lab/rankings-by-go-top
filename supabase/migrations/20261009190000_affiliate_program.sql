-- ============================================================================
-- AFFILIATE PROGRAM: partners, the accounts they refer, what they earned, and
-- what was paid.
--
-- WHY NOW. The program has been published in four languages since 5 October
-- 2026 — rates, payout threshold, reversal rules, an agreement — with NOTHING
-- behind it: no partner record, no referral, no commission, no payout. An
-- applicant could not be given a link, so the live page was an offer the system
-- could not honour. These five tables are that system.
--
--   affiliates            one row per partner, from the moment they apply.
--     code                their personal code, set when they are APPROVED (a
--                         pending applicant has none, so no link can leak
--                         before a person has read the application). Lowercase,
--                         URL-safe, matching normalizeReferralCode() in
--                         lib/affiliate/referral.ts.
--     user_id             the partner's own account, when they have one. It is
--                         what makes "no commission on yourself" checkable:
--                         lib/affiliate/attribution.ts refuses a referral whose
--                         new account IS this user.
--     base_rate/top_rate/top_rate_from
--                         the published terms as data (30%, 40% from 10 active
--                         paying referrals). Per partner, because a negotiated
--                         rate must not mean a code change, and the public page
--                         reads the same numbers from
--                         lib/i18n/public/affiliates.ts (a QA guard holds the
--                         defaults here and that copy to the same figures).
--
--   affiliate_click_days  clicks on a partner's link, COUNTED PER DAY and
--                         nothing else. No visitor identifier, no IP, no user
--                         agent, no referrer: the privacy policy says a partner
--                         link stores nothing on the visitor's device and we
--                         keep no record of the visitor, so the only honest
--                         shape for "clicks" is a counter.
--
--   affiliate_referrals   which NEW account was credited to which partner.
--     referred_user_id    UNIQUE: an account is credited once, for ever. A
--                         second referral claim on the same account is refused
--                         by the database, not by hope.
--     review_flags        signals that ask a human to look (the application's
--                         email equals the new account's email, the referred
--                         site is the partner's own). They FLAG, never block:
--                         an agency signing up a real client looks exactly like
--                         self-referral, and an agency is the best partner we
--                         have.
--
--   affiliate_commissions one row per PAYMENT, which is what "30% of every
--                         payment, for as long as the customer pays" means.
--     (source, external_payment_id) UNIQUE
--                         idempotency. PayPal retries a webhook until it gets a
--                         2xx; without this a retried delivery would pay the
--                         partner twice for one payment.
--     releases_at         earned_at + the hold in the terms (30 days), so a
--                         refund inside the refund window reverses a commission
--                         that was never released.
--     status              pending -> approved -> paid, or reversed. Every
--                         commission is approved by a person before it can be
--                         paid; that manual gate is the program's defence
--                         against a partner who refers themselves.
--
--   affiliate_payouts     a statement: this partner, this period, this amount,
--                         marked paid by an operator with a reference. Money
--                         LEAVES through PayPal, Wise or a bank transfer by
--                         hand, as the published terms say; nothing here moves
--                         money.
--
-- ACCESS. Written ONLY by service-role server code. No role but service_role
-- has any grant, and RLS is on with no policy for `authenticated`: a partner
-- never reaches these rows with their own session, not even their own. Their
-- dashboard is server-rendered and selects counts and sums for THEIR affiliate
-- id. That is not belt-and-braces, it is the live agreement: a partner sees
-- numbers, and never the email, site, plan or identity of a customer they
-- referred. A SELECT policy on affiliate_referrals would hand them
-- referred_user_id, which is exactly the promise we would be breaking.
--
-- VERSION. 20261009180000 is already registered in production as
-- email_suppressions, and a registered version is never run again, so this file
-- carries 190000. A clash would have created nothing and raised nothing.
--
-- RETENTION. applied_ip exists to recognise a flood of applications at the
-- moment they are made, so it is kept for a year and then forgotten:
-- lib/affiliate/retention.ts clears it and deletes a rejected application
-- outright, run daily by /api/affiliate/retention/cron. The guard below lets
-- applied_ip be cleared to NULL and nothing else, so forgetting is possible and
-- rewriting is not, and service_role holds DELETE on this table alone.
--
-- Additive: five new tables and two functions. Nothing existing changes.
-- Idempotent: every statement can be re-run.
-- Rollback (reverse order — the later tables reference the earlier):
--   DROP TABLE IF EXISTS public.affiliate_payouts;
--   DROP TABLE IF EXISTS public.affiliate_commissions;
--   DROP TABLE IF EXISTS public.affiliate_referrals;
--   DROP TABLE IF EXISTS public.affiliate_click_days;
--   DROP TABLE IF EXISTS public.affiliates;
--   DROP FUNCTION IF EXISTS public.affiliates_guard();
--   DROP FUNCTION IF EXISTS public.affiliate_commissions_guard();
-- Executed probe: supabase/migrations/__qa__/affiliate-program.probe.sql
-- ============================================================================

BEGIN;

-- ── The partners ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text,
  user_id        uuid,
  status         text NOT NULL DEFAULT 'pending',

  -- What the applicant told us about themselves. Their own contact details, not
  -- a referred customer's: that distinction is the whole privacy story here.
  name           text NOT NULL,
  email          text NOT NULL,
  phone          text,
  website        text,
  audience       text,
  country        text,

  payout_method  text,
  payout_details text,

  base_rate      numeric(5,2) NOT NULL DEFAULT 30,
  top_rate       numeric(5,2) NOT NULL DEFAULT 40,
  top_rate_from  integer      NOT NULL DEFAULT 10,

  admin_notes    text,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  applied_ip     text,
  decided_at     timestamptz,
  decided_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT affiliates_status CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  -- The same shape normalizeReferralCode() accepts, so a code that exists here
  -- is always a code a link can carry.
  CONSTRAINT affiliates_code_shape CHECK (code IS NULL OR code ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  -- A code is what a link is made of, and a link may only exist for a partner a
  -- person approved. Suspended keeps its code: the link must keep resolving, so
  -- a visitor who clicks an old post still lands on the site.
  CONSTRAINT affiliates_code_when_decided CHECK (status NOT IN ('pending', 'rejected') OR code IS NULL),
  CONSTRAINT affiliates_code_required CHECK (status NOT IN ('approved', 'suspended') OR code IS NOT NULL),
  CONSTRAINT affiliates_decided CHECK ((status = 'pending') = (decided_at IS NULL)),
  CONSTRAINT affiliates_email CHECK (length(email) BETWEEN 3 AND 320 AND position('@' in email) > 1),
  CONSTRAINT affiliates_name CHECK (length(name) BETWEEN 2 AND 160),
  CONSTRAINT affiliates_text_limits CHECK (
    (phone IS NULL OR length(phone) <= 40)
    AND (website IS NULL OR length(website) <= 300)
    AND (audience IS NULL OR length(audience) <= 2000)
    AND (country IS NULL OR length(country) <= 80)
    AND (payout_details IS NULL OR length(payout_details) <= 500)
    AND (admin_notes IS NULL OR length(admin_notes) <= 4000)
    AND (applied_ip IS NULL OR length(applied_ip) <= 64)
  ),
  -- 'credit' is account credit, which is how an Israeli partner with no
  -- registered business is paid — they cannot issue us an invoice.
  CONSTRAINT affiliates_payout_method CHECK (payout_method IS NULL OR payout_method IN ('paypal', 'wise', 'bank', 'credit')),
  CONSTRAINT affiliates_rates CHECK (base_rate > 0 AND base_rate <= 100 AND top_rate >= base_rate AND top_rate <= 100 AND top_rate_from >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliates_code_key ON public.affiliates (code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_user_key ON public.affiliates (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS affiliates_pending_idx ON public.affiliates (applied_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS affiliates_email_idx ON public.affiliates (lower(email));

COMMENT ON TABLE public.affiliates IS
  'One row per affiliate partner, from application to approval: their own contact details, their personal code (only once approved), their commission rates and how they are paid. Written only by service-role server code.';

-- ── Clicks, as a counter and nothing more ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_click_days (
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  day          date NOT NULL,
  clicks       integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (affiliate_id, day),
  CONSTRAINT affiliate_click_days_count CHECK (clicks >= 0)
);

COMMENT ON TABLE public.affiliate_click_days IS
  'Clicks on an affiliate link, counted per day per affiliate. Deliberately holds NO visitor data at all — no IP, no user agent, no referrer, no identifier — because the privacy policy promises an affiliate link stores and records nothing about the visitor.';

-- Counting a click must never be a read-then-write race between two visitors.
CREATE OR REPLACE FUNCTION public.affiliate_count_click(p_affiliate_id uuid, p_day date)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$
  INSERT INTO public.affiliate_click_days (affiliate_id, day, clicks)
  VALUES (p_affiliate_id, p_day, 1)
  ON CONFLICT (affiliate_id, day)
  DO UPDATE SET clicks = public.affiliate_click_days.clicks + 1, updated_at = now();
$$;

-- ── Who was referred ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id     uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL,
  code             text NOT NULL,
  status           text NOT NULL DEFAULT 'signed_up',
  -- Which billing rail the referred account ended up paying on. 'shopify' is
  -- recorded but earns no automatic commission: Shopify sends us no per-charge
  -- event, so those referrals are listed for an operator to commission by hand.
  billing_source   text,
  review_flags     text[] NOT NULL DEFAULT '{}',
  first_paid_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- An account belongs to one affiliate for ever. Last click decides, and the
  -- click that counts is the one on the way to creating the account.
  CONSTRAINT affiliate_referrals_user_once UNIQUE (referred_user_id),
  CONSTRAINT affiliate_referrals_status CHECK (status IN ('signed_up', 'paying', 'churned', 'void')),
  CONSTRAINT affiliate_referrals_billing_source CHECK (billing_source IS NULL OR billing_source IN ('paypal', 'shopify')),
  CONSTRAINT affiliate_referrals_code_shape CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  CONSTRAINT affiliate_referrals_flags CHECK (cardinality(review_flags) <= 8)
);

CREATE INDEX IF NOT EXISTS affiliate_referrals_affiliate_idx ON public.affiliate_referrals (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_referrals_flagged_idx ON public.affiliate_referrals (created_at DESC) WHERE cardinality(review_flags) > 0;

COMMENT ON TABLE public.affiliate_referrals IS
  'Which new account was credited to which affiliate, once and for ever (referred_user_id is unique). review_flags records self-referral signals for a human to read; they never block a referral. No role but service_role may read it: an affiliate is promised counts, never a referred customer''s identity.';

-- ── What was earned ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referral_id         uuid NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
  source              text NOT NULL,
  external_payment_id text NOT NULL,
  payment_amount      numeric(12,2) NOT NULL,
  currency            text NOT NULL,
  rate                numeric(5,2) NOT NULL,
  amount              numeric(12,2) NOT NULL,
  status              text NOT NULL DEFAULT 'pending',
  earned_at           timestamptz NOT NULL DEFAULT now(),
  releases_at         timestamptz NOT NULL,
  approved_at         timestamptz,
  approved_by         uuid,
  paid_at             timestamptz,
  payout_id           uuid,
  reversed_at         timestamptz,
  reversed_reason     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- A retried webhook delivery is the same payment. The database refuses the
  -- second commission; the caller treats that refusal as success.
  CONSTRAINT affiliate_commissions_payment_once UNIQUE (source, external_payment_id),
  CONSTRAINT affiliate_commissions_source CHECK (source IN ('paypal', 'shopify', 'manual')),
  CONSTRAINT affiliate_commissions_status CHECK (status IN ('pending', 'approved', 'paid', 'reversed')),
  CONSTRAINT affiliate_commissions_currency CHECK (currency IN ('ILS', 'USD')),
  CONSTRAINT affiliate_commissions_amounts CHECK (payment_amount >= 0 AND amount >= 0 AND rate > 0 AND rate <= 100),
  CONSTRAINT affiliate_commissions_hold CHECK (releases_at >= earned_at),
  CONSTRAINT affiliate_commissions_reversed CHECK ((status = 'reversed') = (reversed_at IS NOT NULL)),
  CONSTRAINT affiliate_commissions_reason CHECK (reversed_reason IS NULL OR length(reversed_reason) <= 200),
  CONSTRAINT affiliate_commissions_paid CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CONSTRAINT affiliate_commissions_payout CHECK (status <> 'paid' OR payout_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS affiliate_commissions_affiliate_idx ON public.affiliate_commissions (affiliate_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_commissions_payable_idx ON public.affiliate_commissions (releases_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS affiliate_commissions_referral_idx ON public.affiliate_commissions (referral_id);

COMMENT ON TABLE public.affiliate_commissions IS
  'One row per customer payment credited to an affiliate: the payment, the rate applied, the commission, when it is released from the hold, and whether it was approved, paid or reversed. (source, external_payment_id) is unique so a retried payment webhook cannot pay twice.';

-- ── What was paid ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount       numeric(12,2) NOT NULL,
  currency     text NOT NULL,
  status       text NOT NULL DEFAULT 'draft',
  period_start date,
  period_end   date,
  reference    text,
  note         text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT affiliate_payouts_status CHECK (status IN ('draft', 'paid', 'cancelled')),
  CONSTRAINT affiliate_payouts_currency CHECK (currency IN ('ILS', 'USD')),
  CONSTRAINT affiliate_payouts_amount CHECK (amount >= 0),
  CONSTRAINT affiliate_payouts_paid CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CONSTRAINT affiliate_payouts_period CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start),
  CONSTRAINT affiliate_payouts_text CHECK ((reference IS NULL OR length(reference) <= 200) AND (note IS NULL OR length(note) <= 1000))
);

CREATE INDEX IF NOT EXISTS affiliate_payouts_affiliate_idx ON public.affiliate_payouts (affiliate_id, created_at DESC);

COMMENT ON TABLE public.affiliate_payouts IS
  'A payout statement for one affiliate and period, marked paid by an operator with a reference. Nothing here moves money: payment is made by hand through PayPal, Wise or a bank transfer, which is what the published terms say.';

-- A commission's identity never changes, and a reversal is final: without this
-- a correction could silently re-point a paid commission at another partner.
CREATE OR REPLACE FUNCTION public.affiliate_commissions_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.affiliate_id IS DISTINCT FROM OLD.affiliate_id
     OR NEW.referral_id IS DISTINCT FROM OLD.referral_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.external_payment_id IS DISTINCT FROM OLD.external_payment_id
     OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.rate IS DISTINCT FROM OLD.rate
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.earned_at IS DISTINCT FROM OLD.earned_at THEN
    RAISE EXCEPTION 'affiliate_commissions: what was earned never changes' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'reversed' AND NEW.status <> 'reversed' THEN
    RAISE EXCEPTION 'affiliate_commissions: a reversed commission stays reversed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS affiliate_commissions_guard ON public.affiliate_commissions;
CREATE TRIGGER affiliate_commissions_guard BEFORE UPDATE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_commissions_guard();

-- An application's own account of itself is evidence: who applied, when, and
-- from which address is not editable after the fact.
CREATE OR REPLACE FUNCTION public.affiliates_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.applied_at IS DISTINCT FROM OLD.applied_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'affiliates: the application''s own record never changes' USING ERRCODE = '42501';
  END IF;
  -- The applicant's IP may be FORGOTTEN (set to NULL) and nothing else. That is
  -- what retention needs and all it needs: a changed IP would be a rewritten
  -- record, and a restored one would be a year-old address coming back.
  IF NEW.applied_ip IS DISTINCT FROM OLD.applied_ip AND NEW.applied_ip IS NOT NULL THEN
    RAISE EXCEPTION 'affiliates: an applicant''s IP may be cleared, never changed' USING ERRCODE = '42501';
  END IF;
  -- A code is a published link. Once a partner has posted it, re-pointing it at
  -- someone else would credit their audience to another partner.
  IF OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'affiliates: an issued code is never changed or withdrawn' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS affiliates_guard ON public.affiliates;
CREATE TRIGGER affiliates_guard BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.affiliates_guard();

-- ── Row level security and grants ───────────────────────────────────────────
-- RLS is on for all five tables and NO policy exists for `authenticated`: a
-- partner's own session reaches none of these rows. Their dashboard is server
-- rendered and reads counts and sums for their own affiliate id with the
-- service-role client. See the header for why a SELECT policy on
-- affiliate_referrals in particular would break the live agreement.
ALTER TABLE public.affiliates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_click_days  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.affiliates            FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.affiliate_click_days  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.affiliate_referrals   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.affiliate_commissions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.affiliate_payouts     FROM PUBLIC, anon, authenticated, service_role;

-- DELETE on this table alone, and only so a rejected application can be purged
-- a year later (lib/affiliate/retention.ts). No other affiliate table may be
-- deleted from: a commission, a referral and a payout are the books.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.affiliates TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.affiliate_click_days  TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.affiliate_referrals   TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.affiliate_commissions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.affiliate_payouts     TO service_role;

REVOKE ALL ON FUNCTION public.affiliate_count_click(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_count_click(uuid, date) TO service_role;

COMMIT;
