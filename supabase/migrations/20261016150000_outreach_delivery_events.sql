-- ============================================================================
-- OUTREACH DELIVERY EVENTS: the bounces and spam complaints the US outbound
-- channel causes, so that the plan's stop rules are enforced by the machine
-- rather than by someone reading a mailbox.
--
-- WHY. The approved plan
-- (/mnt/project-files/outreach/sending-plan-2026-10-11.md) stops the channel
-- outright above a 3% bounce rate over the last 50 sends, or on one spam
-- complaint, and stops the day on two hard bounces. Until now none of that was
-- enforceable: the sender sees only a permanent rejection at submission, while
-- a real bounce arrives later, as an ordinary message into the mailbox. At five
-- messages a day a person can watch that. At twenty or thirty — which is what
-- Oren asked for on 16 Oct 2026 — a person cannot, and a channel that cannot
-- stop itself is a channel that burns the sending domain before anyone notices.
--
-- The mailbox already POSTs every inbound message to /api/outreach/inbound (the
-- Hostinger webhook "Go Top outreach opt-out", message.received, active since
-- 10 Oct 2026), so the bounces are already arriving at code that throws them
-- away. This table is where they land instead.
--
-- WHAT.
--   outreach_delivery_events   one row per bounce or complaint we observed
--     email_hash   SHA-256 of the address the failure was ABOUT — the original
--                  recipient named in the delivery report, not the daemon that
--                  sent it. NULLable, because a report we cannot attribute is
--                  still a report, and discarding it would hide a pattern.
--                  There is deliberately NO plaintext address column: the
--                  address is already on the prospect row, and a second copy is
--                  a second thing to erase on a deletion request.
--     kind         'hard_bounce' | 'soft_bounce' | 'complaint'.
--     attributed   TRUE only when the hash matched a prospect we actually sent
--                  to. THIS IS THE COLUMN THAT MATTERS, and it exists because of
--                  a real false alarm: on 13 Oct 2026 a MAILER-DAEMON message
--                  arrived about sales@db-toolco.com and looked exactly like our
--                  bounce. It was not. The message HAD been delivered; their
--                  mailbox forwards to Gmail and that third hop was refused. Had
--                  a rate rule counted it, the channel would have stopped itself
--                  over someone else's broken forwarder. Only attributed events
--                  count towards a stop.
--     detail       our own short code ('dsn 5.1.1', 'unmatched recipient'), at
--                  most 200 characters. Never the provider's own words: a
--                  bounce body can carry the recipient's name and the subject of
--                  our message, and this table is not where that belongs.
--     cleared_at   how a full stop is lifted. The stop is DERIVED from these
--                  rows, so it holds until a human has looked: setting
--                  cleared_at on the counted events is that look, and it is an
--                  act with a timestamp rather than a flag someone flipped.
--
-- RETENTION. No plaintext address, so nothing here is erased by a deletion
-- request; the hash is what remains for the same reason it remains in
-- email_suppressions. DELETE is granted so a future retention sweep can drop
-- old rows.
--
-- ACCESS. Service-role server code only. RLS on, no policy for anon or
-- authenticated, their grants revoked.
--
-- Additive: one new table, two indexes. Nothing existing changes.
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.outreach_delivery_events;
-- Executed probe: supabase/migrations/__qa__/outreach-delivery-events.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.outreach_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text,
  kind text NOT NULL,
  attributed boolean NOT NULL DEFAULT false,
  detail text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT outreach_delivery_events_kind CHECK (kind IN ('hard_bounce', 'soft_bounce', 'complaint')),
  CONSTRAINT outreach_delivery_events_hash_shape CHECK (
    email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$'),
  -- An event we could not attribute to a business we wrote to must never be
  -- counted as ours; the CHECK says so where a later writer will see it.
  CONSTRAINT outreach_delivery_events_attribution CHECK (
    attributed = false OR email_hash IS NOT NULL),
  CONSTRAINT outreach_delivery_events_detail_len CHECK (detail IS NULL OR length(detail) <= 200)
);

-- The stop rules' own query: recent attributed events, newest first.
CREATE INDEX IF NOT EXISTS outreach_delivery_events_recent_idx
  ON public.outreach_delivery_events (occurred_at DESC);
-- Finding every event about one address, which is what disqualifying a dead
-- address and answering "why did this business stop" both need.
CREATE INDEX IF NOT EXISTS outreach_delivery_events_hash_idx
  ON public.outreach_delivery_events (email_hash);

COMMENT ON TABLE public.outreach_delivery_events IS
  'Bounces and spam complaints caused by the US outbound channel, so its stop rules run by machine. No plaintext address: the hash joins to outreach_prospects. Only rows with attributed = true count towards a stop, because a MAILER-DAEMON message can be about someone else''s broken forwarder. Service-role only.';

-- ── Row level security and grants ───────────────────────────────────────────
ALTER TABLE public.outreach_delivery_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.outreach_delivery_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.outreach_delivery_events TO service_role;
-- No policy for authenticated or anon: RLS denies by default, and the grants are gone.

COMMIT;
