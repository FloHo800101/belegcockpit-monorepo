do $$
begin
  create type public.link_state as enum ('unlinked', 'linked', 'partial', 'suggested');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_relation_type as enum ('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_state as enum ('final', 'suggested', 'ambiguous');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_direction as enum ('debit', 'credit');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.match_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  relation_type public.match_relation_type not null,
  state public.match_state not null default 'final',
  confidence numeric,
  match_reason text,
  matched_by text,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_groups_tenant_id_idx on public.match_groups (tenant_id);
create unique index if not exists match_groups_id_tenant_id_idx on public.match_groups (id, tenant_id);
create index if not exists match_groups_state_idx on public.match_groups (state);
create index if not exists match_groups_created_at_idx on public.match_groups (created_at desc);

create unique index if not exists documents_id_tenant_id_idx
  on public.documents (id, tenant_id);

create table if not exists public.match_edges_docs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  match_group_id uuid not null,
  document_id uuid not null,
  amount numeric,
  direction public.match_direction,
  created_at timestamptz not null default now(),
  unique (match_group_id, document_id),
  foreign key (match_group_id, tenant_id) references public.match_groups (id, tenant_id) on delete cascade,
  foreign key (document_id, tenant_id) references public.documents (id, tenant_id) on delete cascade
);

create index if not exists match_edges_docs_match_group_id_idx
  on public.match_edges_docs (match_group_id);
create index if not exists match_edges_docs_tenant_id_idx
  on public.match_edges_docs (tenant_id);
create index if not exists match_edges_docs_document_id_idx
  on public.match_edges_docs (document_id);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  amount numeric not null,
  currency text not null,
  value_date date not null,
  booking_date date,
  iban text,
  counterparty_name text,
  end_to_end_id text,
  reference text,
  link_state public.link_state not null default 'unlinked',
  open_amount numeric,
  match_group_id uuid,
  matched_at timestamptz,
  matched_by text,
  match_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_transactions_tenant_id_idx on public.bank_transactions (tenant_id);
create unique index if not exists bank_transactions_id_tenant_id_idx
  on public.bank_transactions (id, tenant_id);
create index if not exists bank_transactions_tenant_id_link_state_idx
  on public.bank_transactions (tenant_id, link_state);
create index if not exists bank_transactions_value_date_idx on public.bank_transactions (value_date desc);
create index if not exists bank_transactions_link_state_idx on public.bank_transactions (link_state);
create index if not exists bank_transactions_match_group_id_idx on public.bank_transactions (match_group_id);
create index if not exists bank_transactions_end_to_end_id_idx on public.bank_transactions (end_to_end_id);

alter table public.bank_transactions
  add constraint bank_transactions_match_group_fk
  foreign key (match_group_id, tenant_id) references public.match_groups (id, tenant_id);

create table if not exists public.match_edges_txs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  match_group_id uuid not null,
  bank_transaction_id uuid not null,
  amount numeric,
  direction public.match_direction,
  created_at timestamptz not null default now(),
  unique (match_group_id, bank_transaction_id),
  foreign key (match_group_id, tenant_id) references public.match_groups (id, tenant_id) on delete cascade,
  foreign key (bank_transaction_id, tenant_id) references public.bank_transactions (id, tenant_id) on delete cascade
);

create index if not exists match_edges_txs_match_group_id_idx
  on public.match_edges_txs (match_group_id);
create index if not exists match_edges_txs_tenant_id_idx
  on public.match_edges_txs (tenant_id);
create index if not exists match_edges_txs_bank_transaction_id_idx
  on public.match_edges_txs (bank_transaction_id);

alter table if exists public.documents
  add column if not exists link_state public.link_state not null default 'unlinked',
  add column if not exists match_group_id uuid,
  add column if not exists open_amount numeric,
  add column if not exists matched_at timestamptz,
  add column if not exists matched_by text,
  add column if not exists match_reason text;

create index if not exists documents_link_state_idx on public.documents (link_state);
create index if not exists documents_tenant_id_link_state_idx on public.documents (tenant_id, link_state);
create index if not exists documents_match_group_id_idx on public.documents (match_group_id);

alter table public.documents
  add constraint documents_match_group_fk
  foreign key (match_group_id, tenant_id) references public.match_groups (id, tenant_id);
