do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'partial'
      and enumtypid = 'public.match_state'::regtype
  ) then
    alter type public.match_state add value 'partial';
  end if;
end $$;

create table if not exists public.matching_runs (
  run_id uuid primary key,
  tenant_id uuid not null,
  params jsonb,
  created_at timestamptz not null default now()
);

create index if not exists matching_runs_tenant_id_idx
  on public.matching_runs (tenant_id);

create table if not exists public.matching_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null,
  event_time timestamptz not null,
  decision_key text not null,
  state public.match_state not null,
  relation_type public.match_relation_type not null,
  tx_ids uuid[] not null default '{}',
  doc_ids uuid[] not null default '{}',
  match_group_id uuid,
  confidence numeric,
  reason_codes text[] not null default '{}',
  inputs jsonb,
  matched_by text,
  created_at timestamptz not null default now()
);

create index if not exists matching_audit_tenant_run_idx
  on public.matching_audit (tenant_id, run_id);
create index if not exists matching_audit_event_time_idx
  on public.matching_audit (event_time desc);

create table if not exists public.matching_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null,
  decision jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists matching_suggestions_tenant_run_idx
  on public.matching_suggestions (tenant_id, run_id);

create table if not exists public.matching_applied_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null,
  op_kind text not null,
  entity_type text not null,
  entity_id uuid,
  match_group_id uuid,
  before_state jsonb,
  after_state jsonb,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists matching_applied_tenant_run_idx
  on public.matching_applied_matches (tenant_id, run_id);
create index if not exists matching_applied_entity_idx
  on public.matching_applied_matches (entity_type, entity_id);

alter table public.match_groups
  add column if not exists run_id uuid;

alter table public.match_edges_docs
  add column if not exists run_id uuid;

alter table public.match_edges_txs
  add column if not exists run_id uuid;

alter table public.documents
  add column if not exists run_id uuid;

alter table public.bank_transactions
  add column if not exists run_id uuid;

create index if not exists match_groups_run_id_idx on public.match_groups (run_id);
create index if not exists match_edges_docs_run_id_idx on public.match_edges_docs (run_id);
create index if not exists match_edges_txs_run_id_idx on public.match_edges_txs (run_id);
create index if not exists documents_run_id_idx on public.documents (run_id);
create index if not exists bank_transactions_run_id_idx on public.bank_transactions (run_id);
