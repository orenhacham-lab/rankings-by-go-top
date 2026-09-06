-- ============================================================================
-- Publishing CHANNEL on content-automation alerts.
--
-- WHY. A publish failure alert recorded WHICH item failed and WHY, but never
-- WHERE. The Content Hub therefore rendered every final-failure alert under one
-- hard-coded heading, "WordPress publish failed" — including Shopify failures on
-- projects with no WordPress connection at all. The heading was not derived from
-- anything; it was a constant, so no amount of reading the row could correct it.
--
-- SCHEMA ONLY. Nullable with no backfill and no default, deliberately:
--   * a NULL channel means UNKNOWN, and the read model renders those under a
--     neutral "Publishing failed" heading. Guessing a platform for a legacy row
--     is exactly the defect being removed, so this migration guesses nothing;
--   * every row written from here on carries an explicit channel;
--   * deploying this without the application change is inert — nothing reads or
--     writes the column yet, and the alert list behaves exactly as it does today.
--
-- The CHECK admits only the two publishing platforms the product has. A future
-- platform needs a migration, which is the point: the value is a contract with
-- the read model's heading map, not free text.
-- ============================================================================

ALTER TABLE public.content_automation_alerts
  ADD COLUMN IF NOT EXISTS channel text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.content_automation_alerts'::regclass
      AND conname = 'content_automation_alerts_channel_check'
  ) THEN
    ALTER TABLE public.content_automation_alerts
      ADD CONSTRAINT content_automation_alerts_channel_check
      CHECK (channel IS NULL OR channel IN ('shopify', 'wordpress'));
  END IF;
END $$;

COMMENT ON COLUMN public.content_automation_alerts.channel IS
  'Publishing platform the failed attempt targeted: shopify | wordpress. NULL = legacy row written before the column existed; the read model renders those neutrally and never guesses a platform.';
