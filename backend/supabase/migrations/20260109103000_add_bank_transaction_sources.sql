alter table public.bank_transactions
  add column if not exists source_document_id uuid,
  add column if not exists source_index integer;

create index if not exists bank_transactions_source_document_id_idx
  on public.bank_transactions (source_document_id);

create unique index if not exists bank_transactions_source_doc_unique
  on public.bank_transactions (tenant_id, source_document_id, source_index)
  where source_document_id is not null and source_index is not null;
