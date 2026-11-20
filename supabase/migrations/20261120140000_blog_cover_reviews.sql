-- WHICH PUBLISHED BLOG COVERS HAVE BEEN LOOKED AT, and what was found.
--
-- The image review (lib/content/image-quality.ts) runs when a cover is made, so
-- it protects articles published from 17 November 2026 onwards and nothing
-- before. Oren reported on 20 November that the faults he named — a mirrored
-- laptop, a figure with two right hands — are still on articles already live.
-- The backfill (lib/blog/auto/cover-repair.ts) reviews those covers and replaces
-- the faulty ones.
--
-- One row per article, written only after a review that actually ran: a review
-- that could not run leaves no row, so the article is picked up again on a later
-- pass instead of being recorded as clean. `image_url` is the cover that was
-- reviewed, so a cover changed afterwards is reviewed again.
--
-- Service role only: RLS is on and no policy is granted. Nothing in it is about
-- any person or project; it is the company's own blog.
create table if not exists public.blog_cover_reviews (
  article_id uuid primary key references public.articles(id) on delete cascade,
  image_url text not null,
  defects text[] not null default '{}',
  replaced_url text,
  checked_at timestamptz not null default now()
);

comment on table public.blog_cover_reviews is
  'One row per published blog article whose cover image has been reviewed: what was found, and the replacement when one was made. Service role only.';

alter table public.blog_cover_reviews enable row level security;
