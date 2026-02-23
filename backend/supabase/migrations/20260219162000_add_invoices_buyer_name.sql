alter table public.invoices
  add column if not exists buyer_name text;
