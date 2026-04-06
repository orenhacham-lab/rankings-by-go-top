-- ============================================================
-- Rankings by Go Top - Supabase Schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- CLIENTS
-- ============================================================
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROJECTS
-- ============================================================
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  target_domain text not null,
  business_name text,
  country text not null default 'IL',
  language text not null default 'he',
  city text,
  device_type text check (device_type in ('desktop', 'mobile')),
  is_active boolean not null default true,
  scan_frequency text not null default 'manual' check (scan_frequency in ('manual', 'weekly', 'monthly')),
  auto_scan_enabled boolean not null default false,
  next_scan_at timestamptz,
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TRACKING TARGETS
-- ============================================================
create table if not exists tracking_targets (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  keyword text not null,
  engine_type text not null check (engine_type in ('google_search', 'google_maps')),
  target_domain text,
  target_business_name text,
  preferred_landing_page text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SCANS
-- ============================================================
create table if not exists scans (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  triggered_by text not null default 'manual' check (triggered_by in ('manual', 'scheduled')),
  total_targets integer not null default 0,
  completed_targets integer not null default 0,
  failed_targets integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SCAN RESULTS
-- ============================================================
create table if not exists scan_results (
  id uuid primary key default uuid_generate_v4(),
  scan_id uuid not null references scans(id) on delete cascade,
  tracking_target_id uuid not null references tracking_targets(id) on delete cascade,
  engine_type text not null check (engine_type in ('google_search', 'google_maps')),
  keyword text not null,
  found boolean not null default false,
  position integer,
  previous_position integer,
  change_value integer,
  result_url text,
  result_title text,
  result_address text,
  checked_at timestamptz not null default now(),
  error_message text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_projects_client_id on projects(client_id);
create index if not exists idx_tracking_targets_project_id on tracking_targets(project_id);
create index if not exists idx_scans_project_id on scans(project_id);
create index if not exists idx_scans_status on scans(status);
create index if not exists idx_scans_created_at on scans(created_at desc);
create index if not exists idx_scan_results_scan_id on scan_results(scan_id);
create index if not exists idx_scan_results_tracking_target_id on scan_results(tracking_target_id);
create index if not exists idx_scan_results_checked_at on scan_results(checked_at desc);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGERS
-- ============================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_clients_updated_at
  before update on clients
  for each row execute function update_updated_at_column();

create trigger update_projects_updated_at
  before update on projects
  for each row execute function update_updated_at_column();

create trigger update_tracking_targets_updated_at
  before update on tracking_targets
  for each row execute function update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table clients enable row level security;
alter table projects enable row level security;
alter table tracking_targets enable row level security;
alter table scans enable row level security;
alter table scan_results enable row level security;

-- Allow authenticated users full access (agency admin model)
create policy "Authenticated users can do everything on clients"
  on clients for all to authenticated using (true) with check (true);

create policy "Authenticated users can do everything on projects"
  on projects for all to authenticated using (true) with check (true);

create policy "Authenticated users can do everything on tracking_targets"
  on tracking_targets for all to authenticated using (true) with check (true);

create policy "Authenticated users can do everything on scans"
  on scans for all to authenticated using (true) with check (true);

create policy "Authenticated users can do everything on scan_results"
  on scan_results for all to authenticated using (true) with check (true);

-- Allow service role bypass (for scheduled scans via API)
-- Service role key bypasses RLS by default in Supabase

-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Latest ranking per tracking target
create or replace view latest_rankings as
select distinct on (sr.tracking_target_id)
  sr.tracking_target_id,
  sr.keyword,
  sr.engine_type,
  sr.found,
  sr.position as latest_position,
  sr.previous_position,
  sr.change_value,
  sr.result_url,
  sr.result_title,
  sr.checked_at as last_checked_at,
  tt.project_id,
  tt.is_active
from scan_results sr
join tracking_targets tt on tt.id = sr.tracking_target_id
order by sr.tracking_target_id, sr.checked_at desc;

-- Project ranking summary
create or replace view project_ranking_summary as
select
  tt.project_id,
  count(distinct tt.id) as total_targets,
  count(distinct tt.id) filter (where tt.is_active) as active_targets,
  count(distinct lr.tracking_target_id) filter (where lr.found) as found_count,
  round(avg(lr.latest_position) filter (where lr.latest_position is not null)) as avg_position,
  min(lr.latest_position) as best_position,
  max(lr.latest_position) as worst_position
from tracking_targets tt
left join latest_rankings lr on lr.tracking_target_id = tt.id
group by tt.project_id;
