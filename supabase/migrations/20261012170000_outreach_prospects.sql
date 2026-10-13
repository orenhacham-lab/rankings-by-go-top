-- ============================================================================
-- OUTREACH PROSPECTS: the businesses the US outbound channel may write to, and
-- the per-recipient secret that makes its unsubscribe link work.
--
-- WHY. The link CAN-SPAM requires was only accepted as `?t=<signed token>`,
-- signed with HMAC keyed from CRON_SECRET (lib/outreach/unsubscribe-token.ts).
-- Only code running on the server can build such a link, so the sender — the
-- Hostinger mailbox, driven from outside the app — had no working unsubscribe
-- link to put in its footer, while the published privacy text promises one in
-- every message. A per-prospect secret stored HERE is a credential the sender
-- can read and the route can verify, so the link works whoever sent the
-- message, and a stranger still cannot suppress an address: the token is 48
-- hex characters of randomness and names exactly one row.
--
-- The published privacy text also binds what this list may hold, and the
-- constraints below are that text expressed as CHECKs rather than as a habit:
-- United States only, two independent public sources recorded per row, a
-- platform the product can actually act on, and no phone number column to put
-- a phone number in.
--
-- WHAT.
--   outreach_prospects    one row per business, at most two messages ever
--     email          the normalized address. NULLable: a California deletion
--                    request redacts it, and `email_hash` keeps the row joinable
--                    to the suppression gate afterwards.
--     email_hash     SHA-256 of the normalized address, hex. Matches
--                    email_suppressions.email_hash, which is how a row and a
--                    suppression find each other after a redaction.
--     unsub_token    the secret in the unsubscribe link. Random, unique, and
--                    the guard refuses to change it: a link in a sent message
--                    must keep working, and CAN-SPAM makes that 30 days at
--                    minimum.
--     country        'US' and nothing else. The privacy text says the list
--                    holds no Israeli, EEA or UK address at all, so the column
--                    cannot hold one.
--     platform       'shopify' or 'wordpress'. The message promises fixes
--                    published directly on the recipient's site; for any other
--                    platform that promise is untrue, which is an FTC Act s.5
--                    exposure quite apart from CAN-SPAM.
--     postal_address the address the business publishes. NULLable for the same
--                    reason the address is: in a one-person business the
--                    published business address is where the person lives, so a
--                    redaction takes it too. A row that is NOT redacted must
--                    still have one — a business that publishes no postal
--                    address never enters the list, which is what the published
--                    privacy text says — and that is now a CHECK rather than a
--                    column modifier, because the modifier cannot tell the two
--                    states apart.
--     source_site    the business's own public page the details came from.
--     source_second  the independent public source that proves it operates in
--                    the United States. Both are NOT NULL: a row that cannot
--                    name two sources does not belong on the list.
--     status         where the row is in its at-most-two-message life.
--     finding        the one specific thing the first message cites, with the
--                    date it was checked. A stale finding is the real exposure,
--                    so the sender re-checks it and the column is only a record
--                    of what was said.
--
-- DELETE IS ALLOWED HERE, unlike email_suppressions. A California deletion
-- request is a deletion, not a suppression: the prospect row goes, and the
-- suppression row (hash only, no plaintext) is what remains to honour the
-- opt-out. That is why the two tables have opposite rules.
--
-- ACCESS. Service-role server code only. RLS on, no policy for anon or
-- authenticated, their grants revoked: a leaked anon key reads no addresses.
--
-- Additive: one new table, one function, one trigger. Nothing existing changes.
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.outreach_prospects;
--   DROP FUNCTION IF EXISTS public.outreach_prospects_guard();
-- Executed probe: supabase/migrations/__qa__/outreach-prospects.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.outreach_prospects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text,
  email_hash        text NOT NULL,
  -- Two random UUIDs with the dashes taken out: 64 hex characters, and no
  -- dependency on pgcrypto being installed in any particular schema.
  unsub_token       text NOT NULL DEFAULT
                      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  company           text NOT NULL,
  contact_name      text,
  site_host         text NOT NULL,
  platform          text NOT NULL,
  country           text NOT NULL DEFAULT 'US',
  postal_address    text,
  source_site       text NOT NULL,
  source_second     text NOT NULL,
  status            text NOT NULL DEFAULT 'new',
  finding           text,
  finding_checked   timestamptz,
  first_sent_at     timestamptz,
  second_sent_at    timestamptz,
  replied_at        timestamptz,
  redacted_at       timestamptz,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT outreach_prospects_hash_shape CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT outreach_prospects_token_shape CHECK (unsub_token ~ '^[0-9a-f]{32,128}$'),
  -- The plaintext, when present, is already normalized: trimmed, lower-cased.
  CONSTRAINT outreach_prospects_email_shape CHECK (
    email IS NULL OR (email = lower(btrim(email)) AND position('@' in email) > 1 AND length(email) <= 320)),
  -- Redaction and the absence of plaintext are the same fact, and a redaction
  -- takes all three of the things that point at a human: the address, the
  -- contact's name and the address the business publishes. A sweep that forgets
  -- one of them fails here rather than quietly keeping it for ever
  -- (lib/outreach/retention.ts; the published privacy text states the period).
  CONSTRAINT outreach_prospects_redaction CHECK (
    (email IS NULL) = (redacted_at IS NOT NULL)
    AND (redacted_at IS NULL OR (contact_name IS NULL AND postal_address IS NULL))),
  -- What the dropped NOT NULL used to say, for the only state it was ever true
  -- in: a live row has a published postal address or it does not belong here.
  CONSTRAINT outreach_prospects_postal_present CHECK (
    redacted_at IS NOT NULL OR postal_address IS NOT NULL),
  -- The one country the published privacy text allows on this list.
  CONSTRAINT outreach_prospects_country CHECK (country = 'US'),
  CONSTRAINT outreach_prospects_platform CHECK (platform IN ('shopify', 'wordpress')),
  CONSTRAINT outreach_prospects_status CHECK (status IN
    ('new', 'sent_first', 'sent_second', 'replied', 'opted_out', 'disqualified')),
  CONSTRAINT outreach_prospects_host_shape CHECK (
    site_host = lower(btrim(site_host)) AND site_host NOT LIKE '%/%' AND length(site_host) BETWEEN 4 AND 253),
  -- A finding and the date it was checked are one fact; a message may not cite
  -- a finding with no date behind it.
  CONSTRAINT outreach_prospects_finding CHECK ((finding IS NULL) = (finding_checked IS NULL)),
  -- The second message only exists after the first.
  CONSTRAINT outreach_prospects_order CHECK (second_sent_at IS NULL OR first_sent_at IS NOT NULL),
  -- `note` is free text and no CHECK can read it, so the rule is stated where
  -- whoever writes one will see it: the published policy says we take nothing
  -- about a person beyond the business role they are published in, and that
  -- binds this column exactly as it binds `contact_name`. A note about the
  -- human behind the business makes the policy a false statement.
  CONSTRAINT outreach_prospects_note_len CHECK (note IS NULL OR length(note) <= 500)
);

-- The table may already exist from an earlier, partly applied run of this file,
-- and CREATE TABLE IF NOT EXISTS changes nothing about a table that is already
-- there. So the three rules that arrived after the first version are applied
-- here as well, in a form that converges from either shape: the postal address
-- becomes erasable, the redaction rule is replaced by the one that names all
-- three columns (`outreach_prospects_redaction_name` said a strictly weaker
-- thing and is dropped rather than kept as a second, redundant rule), and the
-- insert-time requirement the dropped NOT NULL used to carry is added as a
-- CHECK. Every statement is safe to re-run; none of them touches a row.
ALTER TABLE public.outreach_prospects ALTER COLUMN postal_address DROP NOT NULL;
ALTER TABLE public.outreach_prospects DROP CONSTRAINT IF EXISTS outreach_prospects_redaction_name;
ALTER TABLE public.outreach_prospects DROP CONSTRAINT IF EXISTS outreach_prospects_redaction;
ALTER TABLE public.outreach_prospects DROP CONSTRAINT IF EXISTS outreach_prospects_postal_present;
ALTER TABLE public.outreach_prospects
  ADD CONSTRAINT outreach_prospects_redaction CHECK (
    (email IS NULL) = (redacted_at IS NOT NULL)
    AND (redacted_at IS NULL OR (contact_name IS NULL AND postal_address IS NULL)));
ALTER TABLE public.outreach_prospects
  ADD CONSTRAINT outreach_prospects_postal_present CHECK (
    redacted_at IS NOT NULL OR postal_address IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS outreach_prospects_token_key
  ON public.outreach_prospects (unsub_token);
-- One row per address: a business is never written to twice over by accident.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_prospects_hash_key
  ON public.outreach_prospects (email_hash);
-- The sender's own query: who is due a message.
CREATE INDEX IF NOT EXISTS outreach_prospects_status_idx
  ON public.outreach_prospects (status, first_sent_at);

COMMENT ON TABLE public.outreach_prospects IS
  'Businesses the US outbound channel may write to, at most twice. Holds the per-prospect secret that makes the unsubscribe link work for a sender that cannot sign one. United States only, two independent public sources per row, Shopify or WordPress only. Service-role only. DELETE is allowed, because a California deletion request deletes the row and leaves only the suppression hash.';

-- The token and the identity never change, plaintext may only be redacted, and
-- a sent timestamp is never rewritten: a link and a claim in a message someone
-- already received cannot be edited after the fact.
CREATE OR REPLACE FUNCTION public.outreach_prospects_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.unsub_token IS DISTINCT FROM OLD.unsub_token THEN
    RAISE EXCEPTION 'outreach_prospects: the unsubscribe link must keep working' USING ERRCODE = '42501';
  END IF;
  IF NEW.email_hash IS DISTINCT FROM OLD.email_hash OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'outreach_prospects: the key and the time never change' USING ERRCODE = '42501';
  END IF;
  IF OLD.email IS NULL AND NEW.email IS NOT NULL THEN
    RAISE EXCEPTION 'outreach_prospects: redacted plaintext is never restored' USING ERRCODE = '42501';
  END IF;
  IF OLD.first_sent_at IS NOT NULL AND NEW.first_sent_at IS DISTINCT FROM OLD.first_sent_at THEN
    RAISE EXCEPTION 'outreach_prospects: a send that happened is not rewritten' USING ERRCODE = '42501';
  END IF;
  IF OLD.second_sent_at IS NOT NULL AND NEW.second_sent_at IS DISTINCT FROM OLD.second_sent_at THEN
    RAISE EXCEPTION 'outreach_prospects: a send that happened is not rewritten' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS outreach_prospects_guard ON public.outreach_prospects;
CREATE TRIGGER outreach_prospects_guard BEFORE UPDATE ON public.outreach_prospects
  FOR EACH ROW EXECUTE FUNCTION public.outreach_prospects_guard();

-- ── Row level security and grants ───────────────────────────────────────────
ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.outreach_prospects FROM PUBLIC, anon, authenticated, service_role;
-- The server builds the list, sends, records, and deletes a row on a deletion
-- request. No browser role touches it at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.outreach_prospects TO service_role;
-- No policy for authenticated or anon: RLS denies by default, and the grants are gone.

COMMIT;
