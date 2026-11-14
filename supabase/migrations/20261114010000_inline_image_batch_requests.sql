-- The image batch lane's bookkeeping: one row per inline article image ordered
-- from Gemini's Batch API and waiting to be collected.
--
-- WHY. Measured 13 November 2026, the whole Google Cloud bill is the Gemini API,
-- and once the article writer moved to Gemini 3.8 Flash the IMAGES became the
-- larger half of it (₪83.74 of the first twelve days of November, about 410
-- images a month). A batch request costs 50% of the interactive price, and on
-- 14 November 2026 a probe confirmed what no document promised: Google accepts a
-- batch job for `gemini-3.1-flash-image`, the model this product actually uses,
-- and returns a real JPEG.
--
-- WHY THE INLINE IMAGES AND NOT THE HERO. The body images are already
-- asynchronous by design: `article_inline_images` holds a row per image with its
-- own prompt and status, and the figures are composed into the article on demand
-- when it is shown or published — never baked into the stored HTML. An image
-- that arrives hours later therefore just appears. The hero is what a merchant
-- sees first when opening a fresh draft, so it stays a live call.
--
-- WHAT THIS TABLE IS NOT. It never holds the image. The collect pass normalizes
-- the bytes and puts them in the content bucket through the same code as a live
-- call, then finishes the `article_inline_images` row. This table only remembers
-- which job and which request inside it belong to which image row, so a reply
-- that comes back hours later can be matched to its place.
--
-- The image row's own status stays the single source of truth a merchant sees:
-- 'generating' while the job is in flight, then 'ready', or 'failed' with a
-- reason and the editor's regenerate button.

create table if not exists public.inline_image_batch_requests (
  id uuid primary key default gen_random_uuid(),
  -- The Gemini batch job ("batches/...") and the per-request key inside it.
  -- One job carries every inline image of one article.
  job_name text not null,
  request_key text not null,
  model text not null,
  -- The image row this reply belongs to. No foreign key: an article deleted
  -- while its images are in flight must not fail the collect pass, which
  -- simply finds no row to finish and drops the reply.
  inline_image_id uuid not null,
  project_id uuid,
  article_id uuid,
  status text not null default 'submitted',
  last_error text,
  submitted_at timestamptz not null default now(),
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inline_image_batch_requests_status_check
    check (status in ('submitted', 'collected', 'failed', 'expired')),
  -- A job's reply is collected once. Two overlapping collect passes cannot
  -- store the same image twice.
  constraint inline_image_batch_requests_job_key_unique unique (job_name, request_key)
);

-- The collect pass: the jobs still in flight, oldest first.
create index if not exists inline_image_batch_requests_open_idx
  on public.inline_image_batch_requests (status, submitted_at);

-- "Is this image already ordered?", and operator cleanup by article.
create index if not exists inline_image_batch_requests_image_idx
  on public.inline_image_batch_requests (inline_image_id, status);
create index if not exists inline_image_batch_requests_article_idx
  on public.inline_image_batch_requests (article_id);

comment on table public.inline_image_batch_requests is
  'Inline article images ordered from the Gemini Batch API (50% of the interactive price, up to 24h turnaround). Holds no image: the collect pass stores the bytes in the content bucket and finishes the article_inline_images row.';

-- Service-role only, like the rest of the automation bookkeeping: no merchant
-- ever reads or writes this table, and RLS with no policy denies every
-- anon/authenticated request while createAdminClient() bypasses it.
alter table public.inline_image_batch_requests enable row level security;
