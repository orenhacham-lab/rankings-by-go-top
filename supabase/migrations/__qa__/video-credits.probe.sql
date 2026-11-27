-- Disposable Postgres: stubs for Supabase's auth schema and roles, then the migration.
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table public.projects (id uuid primary key);
create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
create role anon; create role authenticated; create role service_role;
\i supabase/migrations/20261127000000_video_studio_credits.sql

create temp table r (name text, ok boolean);
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into public.video_credit_wallets (user_id, balance) values ('00000000-0000-0000-0000-000000000001', 10);
insert into r select 'spend 5 of 10 succeeds', public.video_credit_spend('00000000-0000-0000-0000-000000000001', 5, gen_random_uuid());
insert into r select 'spend 6 of the remaining 5 is refused', not public.video_credit_spend('00000000-0000-0000-0000-000000000001', 6, gen_random_uuid());
insert into r select 'balance is 5 after one spend', (select balance from public.video_credit_wallets) = 5;
select public.video_credit_refund('00000000-0000-0000-0000-000000000001', 5, gen_random_uuid(), 0.0);
insert into r select 'refund restores 10', (select balance from public.video_credit_wallets) = 10;
insert into r select 'ledger has spend + refund', (select count(*) from public.video_credit_ledger) = 2;
insert into r select 'zero or negative spend is refused', not public.video_credit_spend('00000000-0000-0000-0000-000000000001', 0, gen_random_uuid());
insert into r select 'anon cannot execute spend', not has_function_privilege('anon', 'public.video_credit_spend(uuid,integer,uuid)', 'execute');
insert into r select 'authenticated cannot execute spend', not has_function_privilege('authenticated', 'public.video_credit_spend(uuid,integer,uuid)', 'execute');
insert into r select 'service_role can', has_function_privilege('service_role', 'public.video_credit_spend(uuid,integer,uuid)', 'execute');
insert into r select 'negative balance is impossible (check constraint)', (select count(*) from pg_constraint where conrelid = 'public.video_credit_wallets'::regclass and contype = 'c') >= 1;
insert into r select 'video_jobs exists with RLS on', (select relrowsecurity from pg_class where oid = 'public.video_jobs'::regclass);
insert into r select 'bucket is private', (select not public from storage.buckets where id = 'video-studio');
select case when count(*) filter (where not ok) = 0 then 'PROBE OK: ' || count(*) || ' checks' else 'FAIL: ' || string_agg(name, '; ') filter (where not ok) end from r;
