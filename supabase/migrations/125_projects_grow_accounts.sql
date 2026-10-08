-- Grow merchant per building (project). Client-level grow_* remains fallback for legacy tenants.

alter table public.projects
  add column if not exists grow_enabled boolean not null default false,
  add column if not exists grow_user_id text,
  add column if not exists grow_encrypted_lead text,
  add column if not exists grow_onboarding_url text,
  add column if not exists grow_onboarding_status text,
  add column if not exists grow_onboarding_phone text,
  add column if not exists grow_business_number text,
  add column if not exists grow_onboarding_started_at timestamptz,
  add column if not exists grow_onboarding_completed_at timestamptz,
  add column if not exists grow_package_name text;

comment on column public.projects.grow_enabled is
  'Building opted in to Grow collections (requires projects.grow_user_id).';
comment on column public.projects.grow_user_id is
  'Grow merchant userId for this building — money settles here; unique across clients+projects.';
comment on column public.projects.grow_encrypted_lead is
  'Grow GetLink encrypted_lead / tracking_code — bind registration webhook to this project.';
comment on column public.projects.grow_onboarding_status is
  'pending | approved | rejected | existing | error — Grow merchant registration state for the building.';

create unique index if not exists projects_grow_user_id_unique
  on public.projects (trim(grow_user_id))
  where grow_user_id is not null and length(trim(grow_user_id)) > 0;

create unique index if not exists projects_grow_encrypted_lead_unique
  on public.projects (trim(grow_encrypted_lead))
  where grow_encrypted_lead is not null and length(trim(grow_encrypted_lead)) > 0;

-- Snapshot which merchant was used when the payment link was created (forensics).
alter table public.collection_charges
  add column if not exists grow_user_id text;

comment on column public.collection_charges.grow_user_id is
  'Grow userId used when creating the payment link (project merchant, else client fallback).';

create index if not exists collection_charges_grow_user_id_idx
  on public.collection_charges (grow_user_id)
  where grow_user_id is not null;
