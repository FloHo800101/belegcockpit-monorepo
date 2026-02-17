create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  uploaded_by uuid,
  storage_bucket text not null default 'documents',
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_size bigint,
  status text not null default 'uploaded', -- uploaded|processing|processed|failed
  document_type text,
  receipt_date date,
  amount numeric,
  currency text,
  vendor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_tenant_id_idx on public.documents (tenant_id);
create index if not exists documents_created_at_idx on public.documents (created_at desc);
