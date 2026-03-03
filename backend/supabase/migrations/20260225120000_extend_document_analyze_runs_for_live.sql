alter table public.document_analyze_runs
  add column if not exists document_id uuid references public.documents(id) on delete cascade,
  add column if not exists source text not null default 'fixture';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_analyze_runs_source_check'
      and conrelid = 'public.document_analyze_runs'::regclass
  ) then
    alter table public.document_analyze_runs
      add constraint document_analyze_runs_source_check
      check (source in ('fixture', 'live_process', 'live_seed'));
  end if;
end $$;

create index if not exists document_analyze_runs_document_id_idx
  on public.document_analyze_runs (document_id);

create index if not exists document_analyze_runs_source_idx
  on public.document_analyze_runs (source);

create unique index if not exists document_analyze_runs_live_unique_idx
  on public.document_analyze_runs (document_id, model_id, source)
  where source in ('live_process', 'live_seed');
