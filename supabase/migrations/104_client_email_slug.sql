-- Per-tenant Resend local-part (bamakor@bino.casa). Optional override for Hebrew names.
alter table public.clients
  add column if not exists email_slug text;

comment on column public.clients.email_slug is
  'ASCII local-part for Resend From: {slug}@bino.casa (e.g. bamakor, savion).';

create unique index if not exists clients_email_slug_unique
  on public.clients (lower(email_slug))
  where email_slug is not null and length(trim(email_slug)) > 0;
