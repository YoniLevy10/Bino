-- BINO sales-lead discovery (platform ops) — adapted from Fixly prospect engine.
-- Buyers of the BINO platform, not Fixly trade recruits.
-- Service-role only (cron + superadmin API). No tenant RLS access.

-- ---------------------------------------------------------------------------
-- sales_leads
-- ---------------------------------------------------------------------------
create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  phone text,
  whatsapp_phone text,
  phone_normalized text,
  email text,
  city text not null default 'תל אביב',
  search_city text,
  business_address text,
  segment_slug text not null default 'building_mgmt',
  source_name text not null default 'manual',
  source_url text,
  website_url text,
  external_id text,
  status text not null default 'discovered'
    check (status in (
      'discovered',
      'qualified',
      'contacted',
      'demo_scheduled',
      'won',
      'lost',
      'rejected',
      'do_not_contact'
    )),
  fit_score int,
  fit_class text
    check (fit_class is null or fit_class in (
      'suitable',
      'needs_review',
      'unsuitable',
      'unknown'
    )),
  fit_confidence int,
  fit_reasons text[] not null default '{}',
  contactability text
    check (contactability is null or contactability in (
      'mobile',
      'landline',
      'unknown',
      'none'
    )),
  estimated_buildings int,
  estimated_mrr_ils int,
  outreach_angle text,
  notes text,
  enrichment jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  last_seen_at timestamptz,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sales_leads_phone_normalized_unique
  on public.sales_leads (phone_normalized)
  where phone_normalized is not null;

create unique index if not exists idx_sales_leads_source_external_unique
  on public.sales_leads (source_name, external_id)
  where external_id is not null;

create index if not exists idx_sales_leads_status on public.sales_leads (status);
create index if not exists idx_sales_leads_fit_class on public.sales_leads (fit_class);
create index if not exists idx_sales_leads_city_segment
  on public.sales_leads (city, segment_slug);
create index if not exists idx_sales_leads_created_at
  on public.sales_leads (created_at desc);
create index if not exists idx_sales_leads_fit_score
  on public.sales_leads (fit_score desc nulls last);

-- ---------------------------------------------------------------------------
-- sales_lead_events
-- ---------------------------------------------------------------------------
create table if not exists public.sales_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  actor text,
  action text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_lead_events_lead_created
  on public.sales_lead_events (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- sales_lead_discovery_runs
-- ---------------------------------------------------------------------------
create table if not exists public.sales_lead_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null default 'cron'
    check (trigger in ('cron', 'manual')),
  sources text[] not null default '{}',
  city text not null default 'תל אביב',
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'busy')),
  found_count int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  error_count int not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_sales_lead_discovery_runs_started
  on public.sales_lead_discovery_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- query yield stats (budget rotation)
-- ---------------------------------------------------------------------------
create table if not exists public.sales_lead_query_stats (
  query_key text primary key,
  city text not null,
  source_name text not null default 'google_places',
  raw_count int not null default 0,
  unique_new_count int not null default 0,
  suitable_count int not null default 0,
  needs_review_count int not null default 0,
  unsuitable_count int not null default 0,
  api_calls int not null default 0,
  yield_score numeric not null default 0,
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_sales_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sales_leads_updated_at on public.sales_leads;
create trigger trg_sales_leads_updated_at
  before update on public.sales_leads
  for each row
  execute function public.set_sales_leads_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — deny all for anon/authenticated; service-role bypasses
-- ---------------------------------------------------------------------------
alter table public.sales_leads enable row level security;
alter table public.sales_lead_events enable row level security;
alter table public.sales_lead_discovery_runs enable row level security;
alter table public.sales_lead_query_stats enable row level security;

revoke all on public.sales_leads from anon, authenticated;
revoke all on public.sales_lead_events from anon, authenticated;
revoke all on public.sales_lead_discovery_runs from anon, authenticated;
revoke all on public.sales_lead_query_stats from anon, authenticated;
