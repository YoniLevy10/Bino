-- Add normalized phone infrastructure for stable resident matching

alter table public.residents
add column if not exists normalized_phone text;

alter table public.tickets
add column if not exists normalized_phone text;

alter table public.sessions
add column if not exists normalized_phone text;

alter table public.pending_resident_join_requests
add column if not exists normalized_phone text;

create index if not exists idx_residents_normalized_phone
on public.residents(normalized_phone);

create index if not exists idx_tickets_normalized_phone
on public.tickets(normalized_phone);

create index if not exists idx_sessions_normalized_phone
on public.sessions(normalized_phone);

create unique index if not exists idx_residents_project_normalized_phone_unique
on public.residents(client_id, project_id, normalized_phone)
where normalized_phone is not null;
