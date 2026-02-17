create table if not exists public.document_xml_parse_runs (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  source_type text not null,
  parsed_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists document_xml_parse_runs_created_at_idx
  on public.document_xml_parse_runs (created_at desc);
create index if not exists document_xml_parse_runs_storage_path_idx
  on public.document_xml_parse_runs (storage_path);
