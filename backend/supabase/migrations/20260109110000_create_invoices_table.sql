create table if not exists public.invoices (
  id uuid primary key,
  tenant_id uuid not null,
  document_id uuid not null,
  amount numeric,
  currency text,
  invoice_date date,
  due_date date,
  invoice_no text,
  iban text,
  e2e_id text,
  vendor_name text,
  link_state public.link_state not null default 'unlinked',
  open_amount numeric,
  match_group_id uuid,
  matched_at timestamptz,
  matched_by text,
  match_reason text,
  run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_id),
  foreign key (document_id) references public.documents (id) on delete cascade
);

create index if not exists invoices_tenant_id_idx on public.invoices (tenant_id);
create index if not exists invoices_tenant_link_state_idx on public.invoices (tenant_id, link_state);
create index if not exists invoices_invoice_date_idx on public.invoices (invoice_date desc);
create index if not exists invoices_due_date_idx on public.invoices (due_date desc);
create index if not exists invoices_match_group_id_idx on public.invoices (match_group_id);
create index if not exists invoices_document_id_idx on public.invoices (document_id);
create index if not exists invoices_run_id_idx on public.invoices (run_id);
