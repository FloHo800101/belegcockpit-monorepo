create table if not exists public.document_analyze_runs (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  model_id text not null,
  analyze_result jsonb not null,
  parsed_data jsonb,
  parse_confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists document_analyze_runs_created_at_idx
  on public.document_analyze_runs (created_at desc);
create index if not exists document_analyze_runs_model_id_idx
  on public.document_analyze_runs (model_id);
create index if not exists document_analyze_runs_storage_path_idx
  on public.document_analyze_runs (storage_path);
