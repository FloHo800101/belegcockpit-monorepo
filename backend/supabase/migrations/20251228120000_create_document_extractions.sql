create table if not exists public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  status text not null default 'queued', -- queued|running|succeeded|needs_review|failed
  parsing_path text,
  model_used text,
  decision_reason text,
  parse_confidence numeric,
  parsed_data jsonb,
  raw_result jsonb,
  raw_xml text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id)
);

create index if not exists document_extractions_document_id_idx
  on public.document_extractions (document_id);
create index if not exists document_extractions_status_idx
  on public.document_extractions (status);