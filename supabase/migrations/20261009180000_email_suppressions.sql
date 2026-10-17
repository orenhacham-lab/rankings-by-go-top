-- ============================================================================
-- EMAIL SUPPRESSION: one list of addresses we must never email again, shared
-- by every sender in the product.
--
-- WHY. A removal request has to hold across channels: someone who asks out of
-- prospecting email must also stop receiving marketing email, and the other way
-- round. Until now there was no per-address suppression anywhere — the system
-- emails are muted per PROJECT (project_reminder_state.reminders_enabled,
-- project_report_preferences.weekly_email_summary) and a provider's own
-- suppression list does not reach a different provider. Honouring a removal is
-- what makes a lawful channel stay lawful (CAN-SPAM opt-out within 10 business
-- days; Israel's Communications Law s.30A; a California deletion request).
--
-- WHAT.
--   email_suppressions   one row per suppressed address
--     email_hash     SHA-256 of the normalized address (trimmed, lower-cased),
--                    hex. THE key: unique, and the only column a send is
--                    checked against, so the gate keeps working after the
--                    plaintext is redacted.
--     email          the normalized plaintext, for support and audit. NULLable
--                    on purpose: a California deletion request redacts it (sets
--                    it NULL and stamps redacted_at) while the hash stays, so
--                    we can still honour the opt-out without holding readable
--                    personal data. It may go from a value to NULL, never back.
--     source         how the suppression arrived, from a closed list.
--     channel        which channel it came from, from a closed list. It does
--                    NOT narrow the effect: a row suppresses the address for
--                    every sender. It is recorded to answer "where did this
--                    come from".
--     suppressed_at  when. Never changes.
--     note           free text for a manual entry (who asked, in what words).
--
-- ONE DIRECTION ONLY. There is no un-suppressing: no DELETE for any role, a
-- trigger refuses to change the hash or the time, and refuses to put plaintext
-- back after a redaction. Re-consent is a new consent record elsewhere, never
-- the removal of a row here.
--
-- ACCESS. Service-role server code only; it is not a user's own data and no
-- browser role can read it. RLS is on with no policy for authenticated or anon,
-- and their grants are revoked, so a leaked anon key reads nothing.
--
-- Additive: one new table, one function, two triggers. Nothing existing changes.
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.email_suppressions;
--   DROP FUNCTION IF EXISTS public.email_suppressions_guard();
-- Executed probe: supabase/migrations/__qa__/email-suppressions.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash     text NOT NULL,
  email          text,
  source         text NOT NULL,
  channel        text NOT NULL,
  suppressed_at  timestamptz NOT NULL DEFAULT now(),
  redacted_at    timestamptz,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- A SHA-256 in lower-case hex, and nothing else.
  CONSTRAINT email_suppressions_hash_shape CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  -- The plaintext, when present, is already normalized: trimmed, lower-cased.
  CONSTRAINT email_suppressions_email_shape CHECK (
    email IS NULL OR (email = lower(btrim(email)) AND position('@' in email) > 1 AND length(email) <= 320)),
  -- Redaction and the absence of plaintext are the same fact.
  CONSTRAINT email_suppressions_redaction CHECK ((email IS NULL) = (redacted_at IS NOT NULL)),
  CONSTRAINT email_suppressions_source CHECK (source IN
    ('unsubscribe_link', 'reply_optout', 'manual', 'hard_bounce', 'spam_complaint', 'deletion_request')),
  CONSTRAINT email_suppressions_channel CHECK (channel IN
    ('outbound_prospect', 'marketing', 'system')),
  CONSTRAINT email_suppressions_note_len CHECK (note IS NULL OR length(note) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_hash_key
  ON public.email_suppressions (email_hash);

COMMENT ON TABLE public.email_suppressions IS
  'Addresses that must never be emailed again, shared by every sender. Keyed by the SHA-256 of the normalized address so the gate survives redacting the plaintext for a deletion request. Service-role only; rows are never deleted and a suppression is never lifted.';

-- The key and the moment never change; plaintext may only be redacted, never
-- restored; nothing is ever deleted or truncated.
CREATE OR REPLACE FUNCTION public.email_suppressions_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'email_suppressions: a suppression is never lifted' USING ERRCODE = '42501';
  END IF;
  IF NEW.email_hash IS DISTINCT FROM OLD.email_hash
     OR NEW.suppressed_at IS DISTINCT FROM OLD.suppressed_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'email_suppressions: the key and the time never change' USING ERRCODE = '42501';
  END IF;
  IF OLD.email IS NULL AND NEW.email IS NOT NULL THEN
    RAISE EXCEPTION 'email_suppressions: redacted plaintext is never restored' USING ERRCODE = '42501';
  END IF;
  IF OLD.redacted_at IS NOT NULL AND NEW.redacted_at IS DISTINCT FROM OLD.redacted_at THEN
    RAISE EXCEPTION 'email_suppressions: a redaction is final' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS email_suppressions_guard ON public.email_suppressions;
CREATE TRIGGER email_suppressions_guard BEFORE UPDATE OR DELETE ON public.email_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.email_suppressions_guard();
DROP TRIGGER IF EXISTS email_suppressions_no_truncate ON public.email_suppressions;
CREATE TRIGGER email_suppressions_no_truncate BEFORE TRUNCATE ON public.email_suppressions
  FOR EACH STATEMENT EXECUTE FUNCTION public.email_suppressions_guard();

-- ── Row level security and grants ───────────────────────────────────────────
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_suppressions FROM PUBLIC, anon, authenticated, service_role;
-- The server reads the gate, adds a suppression and redacts plaintext. No DELETE.
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_suppressions TO service_role;
-- No policy for authenticated or anon: RLS denies by default, and the grants are gone.

COMMIT;
