alter table projects drop constraint if exists projects_scan_frequency_check;

alter table projects
  add constraint projects_scan_frequency_check
  check (scan_frequency in ('manual', 'weekly', 'monthly', 'monthly_first_day'));
