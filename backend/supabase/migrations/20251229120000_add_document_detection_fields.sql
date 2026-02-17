alter table if exists public.document_extractions
  add column if not exists detected_document_type text,
  add column if not exists detection_confidence numeric,
  add column if not exists detection_reasons jsonb;

create index if not exists document_extractions_detected_document_type_idx
  on public.document_extractions (detected_document_type);
