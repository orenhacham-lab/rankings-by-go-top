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
