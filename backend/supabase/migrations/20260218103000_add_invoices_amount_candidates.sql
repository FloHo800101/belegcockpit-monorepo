alter table public.invoices
  add column if not exists amount_candidates jsonb;
