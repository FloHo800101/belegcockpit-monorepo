alter table public.documents
  add column if not exists file_hash text;

create index if not exists documents_file_hash_idx
  on public.documents (file_hash);

create unique index if not exists documents_tenant_file_hash_unique
  on public.documents (tenant_id, file_hash)
  where file_hash is not null;
