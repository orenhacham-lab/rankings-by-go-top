-- Video studio: prepaid credits. NOT APPLIED TO PRODUCTION. Nothing reads these
-- tables until VIDEO_STUDIO_ENABLED=true, and a purchase flow is a separate decision.
--
-- One wallet per user; every change is a ledger row, so the balance can always be
-- rebuilt. spend() is atomic and refuses to go below zero, which is what makes
-- "no overage" true: the model is called only after a successful spend, and a
-- failed clip is refunded with a second ledger row.

create table if not exists public.video_credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('purchase', 'spend', 'refund', 'adjustment')),
  job_id uuid,
  cost_usd numeric(8, 4),
  created_at timestamptz not null default now()
);
create index if not exists video_credit_ledger_user_idx on public.video_credit_ledger (user_id, created_at desc);

alter table public.video_credit_wallets enable row level security;
alter table public.video_credit_ledger enable row level security;
-- An owner may READ their own rows. No insert/update/delete policy: only the service role writes.
drop policy if exists video_credit_wallets_owner_read on public.video_credit_wallets;
create policy video_credit_wallets_owner_read on public.video_credit_wallets for select using (user_id = auth.uid());
drop policy if exists video_credit_ledger_owner_read on public.video_credit_ledger;
create policy video_credit_ledger_owner_read on public.video_credit_ledger for select using (user_id = auth.uid());

-- Atomic spend: true when the credits were taken, false when the balance is too low.
create or replace function public.video_credit_spend(p_user uuid, p_amount integer, p_job uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok integer;
begin
  if p_amount <= 0 then return false; end if;
  update public.video_credit_wallets set balance = balance - p_amount, updated_at = now()
    where user_id = p_user and balance >= p_amount;
  get diagnostics ok = row_count;
  if ok = 0 then return false; end if;
  insert into public.video_credit_ledger (user_id, delta, reason, job_id) values (p_user, -p_amount, 'spend', p_job);
  return true;
end $$;

create or replace function public.video_credit_refund(p_user uuid, p_amount integer, p_job uuid, p_cost numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.video_credit_wallets set balance = balance + p_amount, updated_at = now() where user_id = p_user;
  insert into public.video_credit_ledger (user_id, delta, reason, job_id, cost_usd) values (p_user, p_amount, 'refund', p_job, p_cost);
end $$;

-- Only the service role may call the functions.
revoke all on function public.video_credit_spend(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.video_credit_refund(uuid, integer, uuid, numeric) from public, anon, authenticated;
grant execute on function public.video_credit_spend(uuid, integer, uuid) to service_role;
grant execute on function public.video_credit_refund(uuid, integer, uuid, numeric) to service_role;

-- One row per clip request. Daily ceilings are counted from here; storage_path is
-- set when the clip is stored and cleared when it expires (7 days).
create table if not exists public.video_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null check (status in ('running', 'done', 'failed')),
  seconds integer not null,
  credits integer not null,
  cost_usd numeric(8, 4),
  storage_path text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists video_jobs_user_day_idx on public.video_jobs (user_id, created_at desc);
create index if not exists video_jobs_expiry_idx on public.video_jobs (expires_at) where storage_path is not null;
alter table public.video_jobs enable row level security;
drop policy if exists video_jobs_owner_read on public.video_jobs;
create policy video_jobs_owner_read on public.video_jobs for select using (user_id = auth.uid());

-- Private bucket: clips are served only through short-lived signed URLs.
insert into storage.buckets (id, name, public) values ('video-studio', 'video-studio', false)
  on conflict (id) do nothing;

-- Purchases: one row per provider payment. (provider, provider_ref) is unique, so a retried
-- capture or a repeated webhook can never grant the credits twice.
create table if not exists public.video_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('paypal', 'creem')),
  provider_ref text not null,
  pack text not null,
  credits integer not null check (credits > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency in ('ILS', 'USD')),
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
alter table public.video_credit_purchases enable row level security;
drop policy if exists video_credit_purchases_owner_read on public.video_credit_purchases;
create policy video_credit_purchases_owner_read on public.video_credit_purchases for select using (user_id = auth.uid());

-- true when the credits were granted now, false when this payment was already booked.
create or replace function public.video_credit_purchase(p_user uuid, p_credits integer, p_provider text, p_ref text, p_pack text, p_amount integer, p_currency text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ins integer;
begin
  if p_credits <= 0 then return false; end if;
  insert into public.video_credit_purchases (user_id, provider, provider_ref, pack, credits, amount_minor, currency)
    values (p_user, p_provider, p_ref, p_pack, p_credits, p_amount, p_currency)
    on conflict (provider, provider_ref) do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return false; end if;
  insert into public.video_credit_wallets (user_id, balance) values (p_user, p_credits)
    on conflict (user_id) do update set balance = public.video_credit_wallets.balance + excluded.balance, updated_at = now();
  insert into public.video_credit_ledger (user_id, delta, reason) values (p_user, p_credits, 'purchase');
  return true;
end $$;
revoke all on function public.video_credit_purchase(uuid, integer, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.video_credit_purchase(uuid, integer, text, text, text, integer, text) to service_role;
