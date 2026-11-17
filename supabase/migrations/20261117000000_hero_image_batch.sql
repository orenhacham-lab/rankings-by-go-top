-- The hero image joins the image batch lane, on the same table and the same job.
--
-- WHY THIS REVERSES A DELIBERATE DECISION. The lane's first migration
-- (20261114_inline_image_batch) says in as many words: "The hero is what a
-- merchant sees first when opening a fresh draft, so it stays a live call."
-- That was written before the lane had ever run. What ran since says the risk
-- it guarded against is much smaller than assumed, and the price of guarding
-- against it much larger:
--
--   * TURNAROUND, measured. Between 14 and 15 November 2026 every batched body
--     image came back in 193-901 seconds — minutes, not the 24 hours Google
--     targets. A queue-generated draft is not opened by its merchant in that
--     window; it sits until its slot.
--   * PRICE, measured. Over 14-16 November 2026 the bill shows image output at
--     ₪45.36 interactive against ₪3.15 batched, at exactly half the unit price
--     (₪0.0001875 vs ₪0.00009375). The hero is the single largest block still
--     paying full price: roughly half of every interactive image, because the
--     body images of a healthy pool already batch and the hero never does.
--
-- WHAT MAKES IT SAFE ANYWAY. Two things, and the second is the one that matters:
--   1. The hero is ordered under the SAME rule as a body image
--      (lib/content/image-batch/may-batch.ts): only by the queue's own
--      generation, only for a pool that is not due, only when its next publish
--      is at least 12 hours away and that time is known. A merchant pressing
--      "generate" still gets a live call.
--   2. PUBLISHING NEVER WAITS. Before an article goes out, the publish path
--      checks for a hero that has not arrived and makes one with a live call
--      (lib/content/image-batch/hero-image-batch.ts, ensureHeroBeforePublish).
--      So the worst case is the price that is paid today, and the ordinary case
--      is half of it. The window where a draft has no hero is the minutes
--      between ordering and collection.
--
-- WHAT CHANGES HERE. Nothing is created: the lane's existing table learns to
-- carry a second kind of request. One job per article can now hold its body
-- images AND its hero, and the collect pass routes each reply by `target`.

-- The kind of image a request is waiting for. 'inline' is every row that
-- existed before this migration, which is why it is the default.
alter table public.inline_image_batch_requests
  add column if not exists target text not null default 'inline';

-- A hero reply has no article_inline_images row to finish — it finishes the
-- article's own featured_image_* columns — so the image id becomes optional.
alter table public.inline_image_batch_requests
  alter column inline_image_id drop not null;

-- The hero's concept sentence and shape, as they were when the request was
-- built. Kept rather than rebuilt at collect time: the concept comes from a
-- model call, so rebuilding it would both cost again and risk storing a
-- featured_image_prompt that is not the prompt the picture was made from.
alter table public.inline_image_batch_requests
  add column if not exists concept text;
alter table public.inline_image_batch_requests
  add column if not exists aspect_ratio text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inline_image_batch_requests_target_check'
  ) then
    alter table public.inline_image_batch_requests
      add constraint inline_image_batch_requests_target_check
      check (target in ('inline', 'hero'));
  end if;

  -- Each kind must carry what its collect branch needs to find its home. A row
  -- that cannot be routed is a reply that would be paid for and dropped.
  if not exists (
    select 1 from pg_constraint where conname = 'inline_image_batch_requests_target_shape_check'
  ) then
    alter table public.inline_image_batch_requests
      add constraint inline_image_batch_requests_target_shape_check
      check (
        (target = 'inline' and inline_image_id is not null)
        or (target = 'hero' and article_id is not null)
      );
  end if;
end $$;

-- "Is this article's hero already ordered?" — asked by the publish-time check
-- on every publish, so it is an index and not a scan.
create index if not exists inline_image_batch_requests_hero_idx
  on public.inline_image_batch_requests (article_id, target, status);

comment on column public.inline_image_batch_requests.target is
  'Which image this reply belongs to: inline (an article_inline_images row) or hero (the article''s own featured_image_* columns).';
