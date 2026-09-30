-- BINO sales lead funnel: stage ≠ interest, owners, tasks, activities, optimistic concurrency.
-- Non-destructive: preserves all leads; maps legacy status → stage; keeps legacy_status.

-- ---------------------------------------------------------------------------
-- sales_operators — CRM identities (not login accounts; Superadmin stays secret-gated)
-- ---------------------------------------------------------------------------
create table if not exists public.sales_operators (
  id uuid primary key,
  display_name text not null,
  email text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_operators_active_sort
  on public.sales_operators (active, sort_order);

-- ---------------------------------------------------------------------------
-- sales_lead_activities — append-only timeline (notes never overwrite each other)
-- ---------------------------------------------------------------------------
create table if not exists public.sales_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  operator_id uuid references public.sales_operators(id) on delete set null,
  actor_label text not null,
  activity_type text not null
    check (activity_type in (
      'note',
      'phone_attempt',
      'call',
      'whatsapp',
      'meeting',
      'demo',
      'proposal',
      'stage_change',
      'owner_change',
      'interest_change',
      'task_created',
      'task_done',
      'whatsapp_link_opened',
      'fields_update',
      'other'
    )),
  body text,
  outcome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edit_history jsonb not null default '[]'::jsonb
);

create index if not exists idx_sales_lead_activities_lead_created
  on public.sales_lead_activities (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- sales_lead_tasks — source of truth for next action
-- ---------------------------------------------------------------------------
create table if not exists public.sales_lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'done', 'cancelled')),
  waiting_for_reply boolean not null default false,
  created_by_operator_id uuid references public.sales_operators(id) on delete set null,
  completed_by_operator_id uuid references public.sales_operators(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_lead_tasks_lead_open_due
  on public.sales_lead_tasks (lead_id, due_at)
  where status = 'open';

create index if not exists idx_sales_lead_tasks_open_due
  on public.sales_lead_tasks (due_at)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- sales_leads — funnel columns
-- ---------------------------------------------------------------------------
alter table public.sales_leads
  add column if not exists legacy_status text;

alter table public.sales_leads
  add column if not exists interest_level text not null default 'unknown';

alter table public.sales_leads
  add column if not exists owner_operator_id uuid references public.sales_operators(id) on delete set null;

alter table public.sales_leads
  add column if not exists created_by_operator_id uuid references public.sales_operators(id) on delete set null;

alter table public.sales_leads
  add column if not exists updated_by_operator_id uuid references public.sales_operators(id) on delete set null;

alter table public.sales_leads
  add column if not exists version bigint not null default 1;

alter table public.sales_leads
  add column if not exists last_contact_at timestamptz;

alter table public.sales_leads
  add column if not exists next_action_title text;

alter table public.sales_leads
  add column if not exists next_action_at timestamptz;

alter table public.sales_leads
  add column if not exists waiting_for_reply boolean not null default false;

alter table public.sales_leads
  add column if not exists waiting_until timestamptz;

alter table public.sales_leads
  add column if not exists lost_reason text;

alter table public.sales_leads
  add column if not exists lost_reason_detail text;

alter table public.sales_leads
  add column if not exists deferred_until timestamptz;

alter table public.sales_leads
  add column if not exists summary text;

alter table public.sales_leads
  add column if not exists contact_role text;

alter table public.sales_leads
  add column if not exists is_decision_maker boolean;

alter table public.sales_leads
  add column if not exists estimated_units int;

alter table public.sales_leads
  add column if not exists primary_need text;

alter table public.sales_leads
  add column if not exists estimated_setup_fee_ils int;

-- Snapshot legacy status before remapping (idempotent)
update public.sales_leads
set legacy_status = status
where legacy_status is null
  and status in (
    'discovered', 'qualified', 'contacted', 'demo_scheduled',
    'won', 'lost', 'rejected', 'do_not_contact',
    'new', 'contact_attempt', 'conversation_held', 'demo_done',
    'proposal_sent', 'negotiation', 'customer', 'deferred'
  );

-- Map old funnel statuses → stage (interest stays unknown — never inferred)
update public.sales_leads
set status = case status
  when 'discovered' then 'new'
  when 'qualified' then 'new'
  when 'contacted' then 'contact_attempt'
  when 'demo_scheduled' then 'demo_scheduled'
  when 'won' then 'customer'
  when 'lost' then 'lost'
  when 'rejected' then 'deferred'
  when 'do_not_contact' then 'lost'
  else status
end
where status in (
  'discovered', 'qualified', 'contacted', 'won', 'lost', 'rejected', 'do_not_contact'
);

update public.sales_leads
set lost_reason = coalesce(lost_reason, 'do_not_contact')
where legacy_status = 'do_not_contact'
  and status = 'lost';

-- Seed last_contact_at from contacted_at without inventing dates
update public.sales_leads
set last_contact_at = contacted_at
where last_contact_at is null
  and contacted_at is not null;

-- Drop old status check, enforce new stage set
alter table public.sales_leads drop constraint if exists sales_leads_status_check;

alter table public.sales_leads
  add constraint sales_leads_status_check
  check (status in (
    'new',
    'contact_attempt',
    'conversation_held',
    'demo_scheduled',
    'demo_done',
    'proposal_sent',
    'negotiation',
    'customer',
    'lost',
    'deferred'
  ));

alter table public.sales_leads alter column status set default 'new';

-- Interest check (drop/re-add if re-run)
alter table public.sales_leads drop constraint if exists sales_leads_interest_level_check;
alter table public.sales_leads
  add constraint sales_leads_interest_level_check
  check (interest_level in ('unknown', 'undecided', 'interested', 'not_interested'));

-- Migrate free-text notes → first activity (preserve text on lead too)
insert into public.sales_lead_activities (lead_id, actor_label, activity_type, body, payload)
select
  id,
  'migration',
  'note',
  notes,
  jsonb_build_object('migrated_from', 'sales_leads.notes')
from public.sales_leads
where notes is not null
  and length(trim(notes)) > 0
  and not exists (
    select 1
    from public.sales_lead_activities a
    where a.lead_id = sales_leads.id
      and a.payload->>'migrated_from' = 'sales_leads.notes'
  );

-- Migrate next_contact_at → open task + denormalized next action (no invented dates)
insert into public.sales_lead_tasks (lead_id, title, due_at, status)
select id, 'מעקב', next_contact_at, 'open'
from public.sales_leads
where next_contact_at is not null
  and not exists (
    select 1
    from public.sales_lead_tasks t
    where t.lead_id = sales_leads.id
      and t.status = 'open'
      and t.title = 'מעקב'
      and t.due_at = sales_leads.next_contact_at
  );

update public.sales_leads l
set
  next_action_title = coalesce(l.next_action_title, 'מעקב'),
  next_action_at = coalesce(l.next_action_at, l.next_contact_at)
where l.next_contact_at is not null
  and (l.next_action_at is null or l.next_action_title is null);

-- Indexes for funnel queries
create index if not exists idx_sales_leads_owner
  on public.sales_leads (owner_operator_id);

create index if not exists idx_sales_leads_interest
  on public.sales_leads (interest_level);

create index if not exists idx_sales_leads_next_action_at
  on public.sales_leads (next_action_at)
  where next_action_at is not null
    and status not in ('customer', 'lost');

create index if not exists idx_sales_leads_waiting
  on public.sales_leads (waiting_until)
  where waiting_for_reply = true;

create index if not exists idx_sales_leads_needs_completion
  on public.sales_leads (created_at desc)
  where owner_operator_id is null
    or next_action_at is null;

create index if not exists idx_sales_leads_status_interest
  on public.sales_leads (status, interest_level);

-- Replace legacy next_contact partial index (old status values)
drop index if exists public.sales_leads_next_contact_at_idx;
create index if not exists sales_leads_next_contact_at_idx
  on public.sales_leads (next_contact_at)
  where next_contact_at is not null
    and status not in ('customer', 'lost');

-- RLS — deny anon/authenticated (service-role bypasses)
alter table public.sales_operators enable row level security;
alter table public.sales_lead_activities enable row level security;
alter table public.sales_lead_tasks enable row level security;

revoke all on public.sales_operators from anon, authenticated;
revoke all on public.sales_lead_activities from anon, authenticated;
revoke all on public.sales_lead_tasks from anon, authenticated;

-- Conversion audit helper comment
comment on column public.sales_leads.legacy_status is
  'Pre-funnel status snapshot (discovered/qualified/contacted/…). Never delete.';
comment on column public.sales_leads.version is
  'Optimistic concurrency token; PATCH must send expectedVersion.';
comment on column public.sales_leads.interest_level is
  'Separate from stage. unknown|undecided|interested|not_interested. Never auto-set from no-answer.';
comment on column public.sales_leads.next_action_at is
  'Denormalized from nearest open sales_lead_tasks.due_at.';
