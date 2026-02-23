create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  document_id uuid not null,
  line_index integer not null,
  description text,
  amount_signed numeric not null,
  amount_abs numeric not null,
  currency text not null,
  link_state public.link_state not null default 'unlinked',
  open_amount numeric not null,
  match_group_id uuid,
  matched_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, line_index),
  foreign key (invoice_id) references public.invoices (id) on delete cascade,
  foreign key (document_id) references public.documents (id) on delete cascade,
  foreign key (match_group_id, tenant_id) references public.match_groups (id, tenant_id)
);

create index if not exists invoice_line_items_tenant_link_state_idx
  on public.invoice_line_items (tenant_id, link_state);
create index if not exists invoice_line_items_invoice_id_idx
  on public.invoice_line_items (invoice_id);
create index if not exists invoice_line_items_tenant_amount_currency_idx
  on public.invoice_line_items (tenant_id, amount_abs, currency);
create index if not exists invoice_line_items_document_id_idx
  on public.invoice_line_items (document_id);
