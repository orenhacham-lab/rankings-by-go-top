-- The batch lane's bookkeeping: one row per article draft ordered from Gemini's
-- Batch API and waiting to be used.
--
-- WHY. Measured on 13 November 2026, the whole Google Cloud bill is the Gemini
-- API, about half of it the article writer's output tokens. Google prices a
-- batch request at 50% of the interactive price for the same model ("Batch API
-- usage is priced at 50% of the standard interactive API cost for the
-- equivalent model", aistudio.google.com/docs/batch-api) in exchange for a
-- turnaround of up to 24 hours. The article queue publishes on a cadence of
-- days and keeps a generated article ready ahead of the next slot, so for the
-- generate-ahead work those hours are slack we already have. Nothing here
-- touches the path a merchant waits on: a dashboard "generate now" stays a
-- live call.
--
-- THE MATCH IS THE PROMPT, NOT THE TOPIC. `prompt_fingerprint` is
-- sha256(model + "\n" + prompt) as the generator itself would build it
-- (articlePromptFingerprint in lib/content/gemini-article.ts). A draft is used
-- only by a generation whose prompt hashes the same, so a topic edited, a depth
-- that re-classifies or an internal link approved in the meantime discards the
-- draft instead of publishing something written to a brief that no longer
-- holds. `topic_id` is here for operators and cleanup, never for the match.
--
-- Rows are disposable. Losing one costs a batch request; using a wrong one
-- would cost an article, which is why the fingerprint and not the topic decides.

create table if not exists public.article_batch_drafts (
  id uuid primary key default gen_random_uuid(),
  -- The Gemini batch job this request was sent in ("batches/..."), and the
  -- per-request key inside it. One job carries several requests.
  job_name text not null,
  request_key text not null,
  model text not null,
  prompt_fingerprint text not null,
  -- Provenance for operators. No foreign key on purpose: a topic deleted while
  -- its draft is in flight must not fail the collect pass, and the draft is
  -- already unusable because its fingerprint will never match again.
  project_id uuid,
  topic_id uuid,
  -- submitted → ready → consumed, or failed/expired, which are both terminal
  -- and simply mean the next generation of that topic is a live call.
  status text not null default 'submitted',
  -- The model's answer, kept only between the collect pass and the generation
  -- that uses it. Cleared on consume.
  response_text text,
  input_tokens integer,
  output_tokens integer,
  last_error text,
  submitted_at timestamptz not null default now(),
  ready_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_batch_drafts_status_check
    check (status in ('submitted', 'ready', 'consumed', 'failed', 'expired')),
  constraint article_batch_drafts_job_key_unique unique (job_name, request_key)
);

-- The consume read: the newest ready draft for this exact prompt.
create index if not exists article_batch_drafts_ready_idx
  on public.article_batch_drafts (prompt_fingerprint, status, ready_at desc);

-- The collect pass: the jobs still in flight.
create index if not exists article_batch_drafts_open_jobs_idx
  on public.article_batch_drafts (status, job_name);

-- The submit pass's "is this topic already ordered?" read, and operator cleanup.
create index if not exists article_batch_drafts_topic_idx
  on public.article_batch_drafts (topic_id, status);

comment on table public.article_batch_drafts is
  'Article drafts ordered from the Gemini Batch API (50% of the interactive price, up to 24h turnaround) for the generate-ahead queue. Matched back to a generation by prompt fingerprint, never by topic.';

-- Service-role only, like the rest of the automation bookkeeping: no merchant
-- ever reads or writes this table, and RLS with no policy denies every
-- anon/authenticated request while createAdminClient() bypasses it.
alter table public.article_batch_drafts enable row level security;
